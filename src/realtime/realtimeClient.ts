/**
 * Realtime 客户端管理器
 * 
 * 负责管理 Supabase Realtime 连接的单例客户端，提供统一的订阅接口。
 * 所有 Realtime 订阅都应通过此模块进行，禁止组件直接使用 supabase.channel()。
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { ConnectionStatus, RealtimeClientConfig, RealtimeEvent } from './types';

interface ChannelInfo {
  channel: RealtimeChannel;
  refCount: number;
  subscriptions: Set<string>;
}

interface RetryInfo {
  timeoutId: ReturnType<typeof setTimeout> | null;
  cancelled: boolean;
}

interface SubscriptionInfo<T> {
  channelName: string;
  callback: (payload: T) => void;
  subscriptionId: string;
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
   * 重要：每个订阅都会创建独立的 channel，确保 .on() 在 .subscribe() 之前调用。
   * 这是因为 Supabase Realtime 要求在调用 .subscribe() 之前配置所有 .on() 监听器。
   * 如果在 .subscribe() 之后调用 .on()，新的监听器可能不会被正确注册到服务器。
   * 
   * @param channelName 频道名称（用于日志标识）
   * @param table 表名
   * @param event 事件类型 (INSERT, UPDATE, DELETE)
   * @param filter 过滤条件 (例如: "project_id=eq.xxx")
   * @param callback 回调函数
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

    const subscriptionId = this.generateSubscriptionId();
    this.subscriptions.set(subscriptionId, {
      channelName: '',
      callback: callback as (payload: unknown) => void,
      subscriptionId
    });
    
    // 初始化重试信息
    const retryInfo: RetryInfo = { timeoutId: null, cancelled: false };
    this.retryInfoMap.set(subscriptionId, retryInfo);
    
    const maxRetries = 3;
    const baseChannelName = `${channelName}-${subscriptionId}`;

    const handleAllChannelDisconnected = (): void => {
      if (this.channels.size === 0) {
        this.connectionStatus = 'disconnected';
        this.config.onConnectionChange?.(false);
      }
    };

    const createAndSubscribe = (retryCount: number): void => {
      // 检查订阅是否已被取消或移除
      const currentRetryInfo = this.retryInfoMap.get(subscriptionId);
      if (!this.subscriptions.has(subscriptionId) || currentRetryInfo?.cancelled) {
        console.log(`[RealtimeClient] 订阅 ${subscriptionId} 已被取消或移除，跳过创建`);
        return;
      }

      const uniqueChannelName = `${baseChannelName}-r${retryCount}`;

      // 打印当前 Supabase 客户端的 channel 列表用于调试
      const existingChannels = supabase.getChannels?.() || [];
      console.log(`[RealtimeClient] 创建订阅 ${subscriptionId}（重试 ${retryCount}/${maxRetries}），频道: ${uniqueChannelName}`);
      console.log('[RealtimeClient] supabase.getChannels()', existingChannels.map((c: RealtimeChannel) => ({ topic: c.topic, state: (c as unknown as { state?: string }).state })));

      // 创建新的 channel
      const channel = supabase.channel(uniqueChannelName);

      // 记录 channel 信息
      const channelInfo: ChannelInfo = {
        channel,
        refCount: 1,
        subscriptions: new Set([subscriptionId])
      };
      this.channels.set(uniqueChannelName, channelInfo);

      // 记录订阅信息
      this.subscriptions.set(subscriptionId, {
        channelName: uniqueChannelName,
        callback: callback as (payload: unknown) => void,
        subscriptionId
      });

      // 配置频道监听（必须在 .subscribe() 之前调用）
      const channelConfig = filter
        ? { event, schema: 'public', table, filter }
        : { event, schema: 'public', table };

      (channel as unknown as { on: (type: string, config: object, callback: (payload: { new: unknown }) => void) => void }).on(
        'postgres_changes',
        channelConfig,
        (payload: { new: unknown }) => {
          console.log(`[RealtimeClient] 收到事件 ${event} on ${table}:`, payload);
          callback(payload.new as T);
        }
      );

      const retryWithBackoff = (): void => {
        // 检查订阅是否已被取消
        const currentRetryInfo = this.retryInfoMap.get(subscriptionId);
        if (currentRetryInfo?.cancelled) {
          console.log(`[RealtimeClient] 订阅 ${subscriptionId} 已被取消，跳过重试`);
          return;
        }

        const nextRetry = retryCount + 1;
        const backoff = Math.min(1000 * 2 ** (retryCount - 1), 8000);

        // 通知外部正在重试
        onStatusChange?.('RETRYING', null);

        supabase.removeChannel(channelInfo.channel);
        this.channels.delete(uniqueChannelName);

        if (nextRetry > maxRetries) {
          console.error(`[RealtimeClient] 频道 ${uniqueChannelName} 重试耗尽`);
          const finalError = new Error(`频道 ${uniqueChannelName} 连接失败`);
          this.config.onError?.(finalError);
          this.config.onChannelFailure?.({
            channelName,
            table,
            event,
            filter,
            error: finalError
          });
          handleAllChannelDisconnected();
          // 通知外部最终失败
          onStatusChange?.('CHANNEL_ERROR', finalError);
          // 清理重试信息
          this.retryInfoMap.delete(subscriptionId);
          return;
        }

        console.log(`[RealtimeClient] 频道 ${uniqueChannelName} 状态异常，${backoff}ms 后重试（第 ${nextRetry} 次）`);
        
        // 存储 timeout ID 以便取消
        const timeoutId = setTimeout(() => {
          createAndSubscribe(nextRetry);
        }, backoff);
        
        if (currentRetryInfo) {
          currentRetryInfo.timeoutId = timeoutId;
        }
      };

      // 调用 .subscribe() 启动频道（在 .on() 之后调用）
      channel.subscribe((statusOrObj: string | { status?: string; state?: string; error?: unknown; err?: unknown }) => {
        // 打印原始回调返回值用于调试
        console.log(`[RealtimeClient] 频道 ${uniqueChannelName} subscribe 原始回调:`, statusOrObj);

        // 同时支持字符串和对象两种形式的 status
        let status: string | undefined;
        let err: unknown = null;

        if (typeof statusOrObj === 'string') {
          status = statusOrObj;
        } else if (statusOrObj && typeof statusOrObj === 'object') {
          // supabase v2 有时返回 { status: 'SUBSCRIBED', ... } 或 { state: 'SUBSCRIBED', ... }
          status = statusOrObj.status ?? statusOrObj.state;
          err = statusOrObj.error ?? statusOrObj.err ?? null;
        }

        console.log(`[RealtimeClient] 频道 ${uniqueChannelName} 状态: ${status}`);

        if (err) {
          console.error(`[RealtimeClient] 频道 ${uniqueChannelName} 错误:`, err);
          const errMessage = err instanceof Error ? err.message : String(err);
          this.config.onError?.(new Error(errMessage));
        }

        if (status === 'SUBSCRIBED') {
          this.connectionStatus = 'connected';
          this.config.onConnectionChange?.(true);
          // 通知外部订阅成功
          onStatusChange?.('SUBSCRIBED', null);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // 检查订阅是否已被取消，避免无限重试
          const currentRetryInfo = this.retryInfoMap.get(subscriptionId);
          if (currentRetryInfo?.cancelled) {
            console.log(`[RealtimeClient] 订阅 ${subscriptionId} 已被取消，跳过状态回调中的重试`);
            return;
          }
          
          // 通知外部状态变化
          const errorObj = err instanceof Error ? err : err ? new Error(String(err)) : null;
          onStatusChange?.(status, errorObj);
          
          // 使用 setTimeout 确保重试是异步的，避免同步递归导致栈溢出
          setTimeout(() => {
            retryWithBackoff();
          }, 0);
        }
      });

      console.log(`[RealtimeClient] 订阅已创建: ${uniqueChannelName}，表: ${table}，事件: ${event}`);
    };

    createAndSubscribe(1);

    // 返回取消订阅函数
    return () => {
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
