import { ArrowLeft, Sparkles, Zap, Shield, Globe, Code, Layers, Cpu, Rocket } from 'lucide-react';
import { motion } from 'framer-motion';

interface IntroPageProps {
  onBack: () => void;
}

const features = [
  {
    icon: Sparkles,
    title: 'AI 驱动开发',
    description: '通过自然语言描述，AI 自动生成完整的 React/TypeScript 项目代码',
    gradient: 'from-purple-500/20 to-pink-500/20',
  },
  {
    icon: Zap,
    title: '实时预览',
    description: '基于 WebContainer 技术，在浏览器中即时预览您的项目，无需本地环境',
    gradient: 'from-amber-500/20 to-orange-500/20',
  },
  {
    icon: Code,
    title: '智能代码生成',
    description: '使用 Gemini 模型生成高质量、可维护的现代化前端代码',
    gradient: 'from-blue-500/20 to-cyan-500/20',
  },
  {
    icon: Layers,
    title: '版本管理',
    description: '内置版本控制系统，轻松回退到任意历史版本',
    gradient: 'from-green-500/20 to-emerald-500/20',
  },
  {
    icon: Shield,
    title: '安全可靠',
    description: '企业级安全架构，您的代码和数据始终受到保护',
    gradient: 'from-red-500/20 to-rose-500/20',
  },
  {
    icon: Globe,
    title: '一键部署',
    description: '项目完成后可直接部署到云端，分享给全世界',
    gradient: 'from-indigo-500/20 to-violet-500/20',
  },
];

const stats = [
  { value: '98%', label: '代码准确率' },
  { value: '10x', label: '开发效率提升' },
  { value: '< 5s', label: '平均响应时间' },
  { value: '24/7', label: '全天候服务' },
];

export default function IntroPage({ onBack }: IntroPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/50 overflow-auto">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-200/30 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-purple-200/30 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-72 h-72 bg-cyan-200/30 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10">
        <header className="sticky top-0 z-20 px-6 py-4">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-7xl mx-auto"
          >
            <div className="backdrop-blur-xl bg-white/40 border border-white/60 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.6)] px-6 py-3 flex items-center justify-between">
              <motion.button
                onClick={onBack}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl backdrop-blur-md bg-white/50 border border-white/60 shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:bg-white/70 transition-all duration-200 text-gray-700"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">返回首页</span>
              </motion.button>
              <div className="flex items-center gap-3">
                <img src="/favicon.svg" alt="Logo" className="w-8 h-8" />
                <span className="text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  AI Site Builder
                </span>
              </div>
              <div className="w-[120px]" />
            </div>
          </motion.div>
        </header>

        <main className="px-6 py-12">
          <div className="max-w-7xl mx-auto space-y-24">
            <motion.section
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="text-center space-y-8"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-md bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-200/50">
                <Rocket className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-700">Version 1.0 正式发布</span>
              </div>
              
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
                <span className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent">
                  用 AI 构建
                </span>
                <br />
                <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  下一代 Web 应用
                </span>
              </h1>
              
              <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
                AI Site Builder 是一个革命性的 Web 开发平台，让您通过自然语言对话即可创建专业级的 React 应用，无需编写一行代码。
              </p>

              <div className="flex items-center justify-center gap-4 pt-4">
                <motion.button
                  onClick={onBack}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-[0_8px_32px_rgba(59,130,246,0.35)] hover:shadow-[0_12px_40px_rgba(59,130,246,0.45)] transition-all duration-300"
                >
                  立即开始构建
                </motion.button>
                <motion.a
                  href="https://github.com/pgd-LC2/aisitebuilder"
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-8 py-4 rounded-2xl backdrop-blur-md bg-white/60 border border-white/80 text-gray-700 font-semibold shadow-[0_4px_16px_rgba(0,0,0,0.08)] hover:bg-white/80 transition-all duration-300"
                >
                  查看源码
                </motion.a>
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.4 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-6"
            >
              {stats.map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.5 + index * 0.1 }}
                  className="backdrop-blur-xl bg-white/50 border border-white/60 rounded-2xl p-6 text-center shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.6)]"
                >
                  <div className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                    {stat.value}
                  </div>
                  <div className="text-sm text-gray-600 mt-2">{stat.label}</div>
                </motion.div>
              ))}
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.6 }}
              className="space-y-12"
            >
              <div className="text-center space-y-4">
                <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                  强大的功能特性
                </h2>
                <p className="text-gray-600 max-w-xl mx-auto">
                  集成最先进的 AI 技术，为您提供前所未有的开发体验
                </p>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {features.map((feature, index) => (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.7 + index * 0.1 }}
                    whileHover={{ y: -4, transition: { duration: 0.2 } }}
                    className="group relative backdrop-blur-xl bg-white/50 border border-white/60 rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.6)] hover:shadow-[0_16px_48px_rgba(0,0,0,0.1)] transition-all duration-300"
                  >
                    <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                    <div className="relative z-10">
                      <div className="w-12 h-12 rounded-xl backdrop-blur-md bg-white/70 border border-white/80 shadow-[0_4px_12px_rgba(0,0,0,0.05)] flex items-center justify-center mb-4">
                        <feature.icon className="w-6 h-6 text-blue-600" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        {feature.title}
                      </h3>
                      <p className="text-gray-600 text-sm leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.8 }}
              className="backdrop-blur-xl bg-gradient-to-r from-blue-600/90 to-indigo-600/90 border border-white/20 rounded-3xl p-12 text-center shadow-[0_16px_64px_rgba(59,130,246,0.25)]"
            >
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md mb-4">
                  <Cpu className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-white">
                  准备好开始了吗？
                </h2>
                <p className="text-blue-100 text-lg">
                  加入数千名开发者的行列，体验 AI 驱动的下一代 Web 开发方式
                </p>
                <motion.button
                  onClick={onBack}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-8 py-4 rounded-2xl bg-white text-blue-600 font-semibold shadow-[0_8px_32px_rgba(0,0,0,0.15)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.2)] transition-all duration-300"
                >
                  免费开始使用
                </motion.button>
              </div>
            </motion.section>

            <motion.footer
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 1 }}
              className="text-center py-8 text-gray-500 text-sm"
            >
              <p>AI Site Builder V1.0 - 由 Gemini AI 驱动</p>
              <p className="mt-2">Made with AI, for everyone.</p>
            </motion.footer>
          </div>
        </main>
      </div>
    </div>
  );
}
