/**
 * Realtime 客户端管理器
 * 
 * 负责管理 Supabase Realtime 连接的单例客户端，提供统一的订阅接口。
 * 所有 Realtime 订阅都应通过此模块进行，禁止组件直接使用 supabase.channel()。
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, refreshRealtimeAuth } from '../lib/supabase';
import type { ConnectionStatus, RealtimeClientConfig, RealtimeEvent } from './types';

interface ChannelInfo {
  channel: RealtimeChannel;
  refCount: number;
  subscriptions: Set<string>;
  /** 记录底层 channel 最后一次收到的状态，用于复用时立即通知新订阅者 */
  lastStatus?: string;
  lastError?: Error | null;
  /** 标记频道是否已处理 CLOSED 状态，用于防抖避免重复处理 */
  closed?: boolean;
}

interface RetryInfo {
  timeoutId: ReturnType<typeof setTimeout> | null;
  cancelled: boolean;
}

interface SubscriptionInfo<T> {
  channelName: string;
  callback: (payload: T) => void;
  subscriptionId: string;
  /** 状态变化回调，用于广播 SUBSCRIBED/CLOSED 等状态给所有订阅者 */
  onStatusChange?: (status?: string | undefined, error?: Error | null) => void;
}

class RealtimeClient {
  private static instance: RealtimeClient | null = null;
  private channels: Map<string, ChannelInfo> = new Map();
  private subscriptions: Map<string, SubscriptionInfo<unknown>> = new Map();
  private retryInfoMap: Map<string, RetryInfo> = new Map();
  private connectionStatus: ConnectionStatus = 'disconnected';
  private config: RealtimeClientConfig = {};
  private initialized = false;
  private subscriptionCounter = 0;

  private constructor() {
    // 私有构造函数，确保单例模式
  }

  /**
   * 获取 RealtimeClient 单例实例
   */
  static getInstance(): RealtimeClient {
    if (!RealtimeClient.instance) {
      RealtimeClient.instance = new RealtimeClient();
    }
    return RealtimeClient.instance;
  }

  /**
   * 初始化客户端
   */
  initialize(config?: RealtimeClientConfig): void {
    // 检查是否在浏览器环境
    if (typeof window === 'undefined') {
      console.warn('[RealtimeClient] 只能在浏览器环境中初始化');
      return;
    }

    if (this.initialized) {
      // 更新配置
      if (config) {
        this.config = { ...this.config, ...config };
      }
      return;
    }

    this.config = config || {};
    this.initialized = true;
    this.connectionStatus = 'connecting';

    console.log('[RealtimeClient] 初始化完成');
  }

  /**
   * 获取当前连接状态
   */
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.connectionStatus === 'connected';
  }

  /**
   * 生成唯一的订阅 ID
   */
  private generateSubscriptionId(): string {
    this.subscriptionCounter += 1;
    return `sub_${Date.now()}_${this.subscriptionCounter}`;
  }

  /**
   * 订阅数据库变更事件
   * 
   * 重要：按 channelName + filter 复用 channel，避免为每个订阅创建独立短寿命 channel。
   * 这样可以避免竞态与漏收问题。仅在第一次创建 channel 时 attach 一个 .on() 处理器，
   * 该处理器负责把事件广播给该 channel 下所有订阅者。
   * 
   * @param channelName 频道名称（用于日志标识）
   * @param table 表名
   * @param event 事件类型 (INSERT, UPDATE, DELETE)
   * @param filter 过滤条件 (例如: "project_id=eq.xxx")
   * @param callback 回调函数
   * @param onStatusChange 状态变化回调
   * @returns 取消订阅函数
   */
  subscribe<T>(
    channelName: string,
    table: string,
    event: RealtimeEvent,
    filter: string | undefined,
    callback: (payload: T) => void,
    onStatusChange?: (status: string | undefined, error?: Error | null) => void
  ): () => void {
    if (typeof window === 'undefined') {
      console.warn('[RealtimeClient] 无法在服务端订阅');
      return () => {};
    }

    if (!this.initialized) {
      this.initialize();
    }

    // 生成订阅 id
    const subscriptionId = this.generateSubscriptionId();
    let cancelled = false;

    // 预注册（占位）
    this.subscriptions.set(subscriptionId, {
      channelName: '',
      callback: callback as (payload: unknown) => void,
      subscriptionId
    });

    // 初始化 retry 信息占位（保留结构）
    const retryInfo: RetryInfo = { timeoutId: null, cancelled: false };
    this.retryInfoMap.set(subscriptionId, retryInfo);

    // 使用表名 + filter 作为 channel 的 key，确保复用
    const baseChannelKey = filter ? `${channelName}::${filter}` : channelName;

    const setupSubscription = async () => {
      await refreshRealtimeAuth({ ensureConnected: true });

      if (cancelled) {
        return;
      }

      // 如果还没创建 channel，则创建并 attach 一个通用的 on() 处理器
      let channelInfo = this.channels.get(baseChannelKey);
      if (!channelInfo) {
        // 打印当前 Supabase 客户端的 channel 列表用于调试
        const existingChannels = supabase.getChannels?.() || [];
        console.log(`[RealtimeClient] 创建新频道: ${baseChannelKey}`);
        console.log('[RealtimeClient] supabase.getChannels()', existingChannels.map((c: RealtimeChannel) => ({ topic: c.topic, state: (c as unknown as { state?: string }).state })));

        const channel = supabase.channel(baseChannelKey);

        const channelConfig = filter
          ? { event, schema: 'public', table, filter }
          : { event, schema: 'public', table };

        // 只 attach 一次：把收到的事件分发给该 channel 下所有订阅回调
        (channel as unknown as { on: (type: string, config: object, callback: (payload: { new: unknown }) => void) => void }).on(
          'postgres_changes',
          channelConfig,
          (payload: { new: unknown }) => {
            console.log(`[RealtimeClient] 收到事件 ${event} on ${table}:`, payload);
            const subs = this.channels.get(baseChannelKey)?.subscriptions;
            if (subs) {
              subs.forEach(subId => {
                const sub = this.subscriptions.get(subId);
                if (sub) {
                  try {
                    (sub.callback as (p: unknown) => void)(payload.new);
                  } catch (e) {
                    console.error(`[RealtimeClient] 分发到订阅 ${subId} 时出错:`, e);
                  }
                }
              });
            }
          }
        );

        // subscribe 回调：负责把订阅状态广播给该 channel 下所有订阅者
        channel.subscribe((statusOrObj: string | { status?: string; state?: string; error?: unknown; err?: unknown }) => {
          console.log(`[RealtimeClient] 频道 ${baseChannelKey} subscribe 原始回调:`, statusOrObj);

          let status: string | undefined;
          let err: unknown = null;

          if (typeof statusOrObj === 'string') {
            status = statusOrObj;
          } else if (statusOrObj && typeof statusOrObj === 'object') {
            status = statusOrObj.status ?? statusOrObj.state;
            err = statusOrObj.error ?? statusOrObj.err ?? null;
          }

          console.log(`[RealtimeClient] 频道 ${baseChannelKey} 状态: ${status}`);

          if (err) {
            console.error(`[RealtimeClient] 频道 ${baseChannelKey} 错误:`, err);
          }

          // 获取当前 channelInfo 并更新 lastStatus/lastError
          const currentChannelInfo = this.channels.get(baseChannelKey);
          if (currentChannelInfo && status) {
            currentChannelInfo.lastStatus = status;
            currentChannelInfo.lastError = err instanceof Error ? err : err ? new Error(String(err)) : null;
          }

          if (status === 'SUBSCRIBED') {
            this.connectionStatus = 'connected';
            this.config.onConnectionChange?.(true);
            // 广播给所有订阅此 channel 的订阅者
            const subs = currentChannelInfo?.subscriptions;
            if (subs) {
              console.log(`[RealtimeClient] 状态广播: baseChannelKey=${baseChannelKey}, status=SUBSCRIBED, subs=[${Array.from(subs).join(', ')}]`);
              subs.forEach(subId => {
                const subInfo = this.subscriptions.get(subId) as SubscriptionInfo<unknown> | undefined;
                try {
                  subInfo?.onStatusChange?.('SUBSCRIBED', null);
                } catch (e) {
                  console.error(`[RealtimeClient] 广播 SUBSCRIBED 到订阅 ${subId} 时出错:`, e);
                }
              });
            }
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // 防抖：如果已经处理过 CLOSED，跳过重复处理
            // 这是修复死循环的关键：Supabase SDK 可能多次触发 CLOSED 回调
            if (currentChannelInfo?.closed) {
              console.log(`[RealtimeClient] 频道 ${baseChannelKey} 已处理过 ${status}，跳过重复处理`);
              return;
            }
            
            const errorObj = err instanceof Error ? err : err ? new Error(String(err)) : null;
            
            // 广播给所有订阅此 channel 的订阅者
            const subs = currentChannelInfo?.subscriptions;
            if (subs) {
              console.log(`[RealtimeClient] 状态广播: baseChannelKey=${baseChannelKey}, status=${status}, subs=[${Array.from(subs).join(', ')}]`);
              subs.forEach(subId => {
                const subInfo = this.subscriptions.get(subId) as SubscriptionInfo<unknown> | undefined;
                try {
                  subInfo?.onStatusChange?.(status, errorObj);
                } catch (e) {
                  console.error(`[RealtimeClient] 广播 ${status} 到订阅 ${subId} 时出错:`, e);
                }
              });
            }
            
            // 关键修复：当频道进入错误状态时，从缓存中移除该频道
            // 这样下次订阅时会创建新的频道，而不是复用已经失效的频道
            // 注意：不在这里清理 subscriptions Map，由 unsubscribe() 和 cleanup() 统一负责
            // 避免与 cleanup() 的清理逻辑冲突
            if (currentChannelInfo) {
              // 标记为已处理，防止后续 CLOSED 回调重复处理
              currentChannelInfo.closed = true;
              
              console.log(`[RealtimeClient] 频道 ${baseChannelKey} 进入 ${status} 状态，从缓存中移除`);
              
              supabase.removeChannel(currentChannelInfo.channel);
              this.channels.delete(baseChannelKey);
            }
          }
        });

        channelInfo = {
          channel,
          refCount: 0,
          subscriptions: new Set()
        };

        this.channels.set(baseChannelKey, channelInfo);

        console.log(`[RealtimeClient] 创建并订阅底层频道: ${baseChannelKey}`);
      } else {
        console.log(`[RealtimeClient] 复用已有频道: ${baseChannelKey}, refCount=${channelInfo.refCount}`);
      }

      if (!channelInfo) {
        return;
      }

      // 注册一个订阅引用
      channelInfo.refCount += 1;
      channelInfo.subscriptions.add(subscriptionId);
      this.subscriptions.set(subscriptionId, {
        channelName: baseChannelKey,
        callback: callback as (payload: unknown) => void,
        subscriptionId,
        onStatusChange
      });

      console.log(`[RealtimeClient] 订阅已创建: ${baseChannelKey}，表: ${table}，事件: ${event}，refCount: ${channelInfo.refCount}`);

      // 如果复用已有 channel 且底层已经处于 SUBSCRIBED，立即通知新订阅者
      // 这样可以确保新订阅者能触发 catch-up 刷新
      if (channelInfo.lastStatus === 'SUBSCRIBED') {
        console.log(`[RealtimeClient] 复用已 SUBSCRIBED 的频道，立即通知新订阅者: ${subscriptionId}`);
        try {
          onStatusChange?.('SUBSCRIBED', null);
        } catch (e) {
          console.error(`[RealtimeClient] 立即通知订阅 ${subscriptionId} SUBSCRIBED 时出错:`, e);
        }
      } else if (channelInfo.lastStatus === 'CLOSED' || channelInfo.lastStatus === 'CHANNEL_ERROR' || channelInfo.lastStatus === 'TIMED_OUT') {
        // 如果底层 channel 已经处于错误状态，也立即通知新订阅者
        console.log(`[RealtimeClient] 复用已 ${channelInfo.lastStatus} 的频道，立即通知新订阅者: ${subscriptionId}`);
        try {
          onStatusChange?.(channelInfo.lastStatus, channelInfo.lastError);
        } catch (e) {
          console.error(`[RealtimeClient] 立即通知订阅 ${subscriptionId} ${channelInfo.lastStatus} 时出错:`, e);
        }
      }
    };

    void setupSubscription();

    // 返回取消订阅函数
    return () => {
      cancelled = true;
      this.unsubscribe(subscriptionId);
    };
  }

  /**
   * 取消订阅
   */
  private unsubscribe(subscriptionId: string): void {
    const subscriptionInfo = this.subscriptions.get(subscriptionId);
    if (!subscriptionInfo) {
      console.log(`[RealtimeClient] unsubscribe: 订阅 ${subscriptionId} 不存在`);
      return;
    }

    // 取消待执行的重试（不删除 retryInfo，保留 cancelled 标记供后续回调检查）
    const retryInfo = this.retryInfoMap.get(subscriptionId);
    if (retryInfo) {
      retryInfo.cancelled = true;
      if (retryInfo.timeoutId) {
        clearTimeout(retryInfo.timeoutId);
        retryInfo.timeoutId = null;
        console.log(`[RealtimeClient] unsubscribe: 已取消订阅 ${subscriptionId} 的待执行重试`);
      }
      // 注意：不删除 retryInfo，保留 cancelled 标记供后续异步回调检查
    }

    const { channelName } = subscriptionInfo;
    const channelInfo = this.channels.get(channelName);

    console.log(`[RealtimeClient] unsubscribe: 取消订阅 ${subscriptionId}，频道: ${channelName}，当前 refCount: ${channelInfo?.refCount}`);

    if (channelInfo) {
      channelInfo.subscriptions.delete(subscriptionId);
      channelInfo.refCount -= 1;

      // 如果没有更多订阅，关闭频道
      if (channelInfo.refCount <= 0) {
        // 打印当前 channel 列表用于调试
        const existingChannels = supabase.getChannels?.() || [];
        console.log(`[RealtimeClient] 关闭频道: ${channelName}，原因: refCount 为 0`);
        console.log('[RealtimeClient] 关闭前 supabase.getChannels()', existingChannels.map((c: RealtimeChannel) => ({ topic: c.topic, state: (c as unknown as { state?: string }).state })));
        
        supabase.removeChannel(channelInfo.channel);
        this.channels.delete(channelName);
        
        const remainingChannels = supabase.getChannels?.() || [];
        console.log('[RealtimeClient] 关闭后 supabase.getChannels()', remainingChannels.map((c: RealtimeChannel) => ({ topic: c.topic, state: (c as unknown as { state?: string }).state })));
      }
    }

    this.subscriptions.delete(subscriptionId);
  }

  /**
   * 清理所有订阅
   */
  cleanup(): void {
    // 打印清理前的 channel 列表用于调试
    const existingChannels = supabase.getChannels?.() || [];
    console.log('[RealtimeClient] cleanup: 清理所有订阅');
    console.log('[RealtimeClient] cleanup: 清理前 supabase.getChannels()', existingChannels.map((c: RealtimeChannel) => ({ topic: c.topic, state: (c as unknown as { state?: string }).state })));
    console.log(`[RealtimeClient] cleanup: 当前管理的频道数: ${this.channels.size}，订阅数: ${this.subscriptions.size}，待执行重试数: ${this.retryInfoMap.size}`);

    // 取消所有待执行的重试
    this.retryInfoMap.forEach((retryInfo, subscriptionId) => {
      retryInfo.cancelled = true;
      if (retryInfo.timeoutId) {
        clearTimeout(retryInfo.timeoutId);
        console.log(`[RealtimeClient] cleanup: 已取消订阅 ${subscriptionId} 的待执行重试`);
      }
    });
    this.retryInfoMap.clear();

    // 关闭所有频道
    this.channels.forEach((channelInfo, channelName) => {
      console.log(`[RealtimeClient] cleanup: 关闭频道: ${channelName}，refCount: ${channelInfo.refCount}`);
      supabase.removeChannel(channelInfo.channel);
    });

    // 防御性清理：确保 Supabase 客户端内部的 channel 也被移除，避免页面回到前台时残留的“幽灵频道”影响重连
    const clientChannels = supabase.getChannels?.() || [];
    clientChannels.forEach(channel => {
      supabase.removeChannel(channel);
    });

    // 彻底断开 Realtime 连接，确保下次订阅使用全新 socket
    void supabase.realtime.disconnect();

    this.channels.clear();
    this.subscriptions.clear();
    this.connectionStatus = 'disconnected';
    this.config.onConnectionChange?.(false);

    // 打印清理后的 channel 列表用于调试
    const remainingChannels = supabase.getChannels?.() || [];
    console.log('[RealtimeClient] cleanup: 清理后 supabase.getChannels()', remainingChannels.map((c: RealtimeChannel) => ({ topic: c.topic, state: (c as unknown as { state?: string }).state })));
  }

  /**
   * 重置单例（仅用于测试）
   */
  static resetInstance(): void {
    if (RealtimeClient.instance) {
      RealtimeClient.instance.cleanup();
      RealtimeClient.instance = null;
    }
  }
}

// 导出单例获取函数
export const getRealtimeClient = (): RealtimeClient => {
  return RealtimeClient.getInstance();
};

// 导出便捷的订阅函数
export const subscribeToTable = <T>(
  channelName: string,
  table: string,
  event: RealtimeEvent,
  filter: string | undefined,
  callback: (payload: T) => void,
  _onStatusChange?: (status: string | undefined, error?: Error | null) => void
): (() => void) => {
  const client = getRealtimeClient();
  return client.subscribe<T>(channelName, table, event, filter, callback, _onStatusChange);
};

// 导出清理函数
export const cleanupRealtime = (): void => {
  const client = getRealtimeClient();
  client.cleanup();
};

// 导出连接状态检查函数
export const isRealtimeConnected = (): boolean => {
  const client = getRealtimeClient();
  return client.isConnected();
};

export default RealtimeClient;
