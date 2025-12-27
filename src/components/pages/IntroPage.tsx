import { ArrowLeft, Sparkles, Zap, Shield, Globe, Code, Layers, Cpu, Rocket } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';

interface IntroPageProps {
  onBack: () => void;
}

const features = [
  {
    icon: Sparkles,
    title: 'AI 驱动开发',
    description: '通过自然语言描述，AI 自动生成完整的 React/TypeScript 项目代码',
  },
  {
    icon: Zap,
    title: '实时预览',
    description: '基于 WebContainer 技术，在浏览器中即时预览您的项目，无需本地环境',
  },
  {
    icon: Code,
    title: '智能代码生成',
    description: '使用 Gemini 模型生成高质量、可维护的现代化前端代码',
  },
  {
    icon: Layers,
    title: '版本管理',
    description: '内置版本控制系统，轻松回退到任意历史版本',
  },
  {
    icon: Shield,
    title: '安全可靠',
    description: '企业级安全架构，您的代码和数据始终受到保护',
  },
  {
    icon: Globe,
    title: '一键部署',
    description: '项目完成后可直接部署到云端，分享给全世界',
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
    <div className="min-h-screen bg-background overflow-auto relative">
      <div className="relative z-10">
        <header className="sticky top-0 z-20 px-6 py-4 bg-background border-b border-border">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-7xl mx-auto"
          >
            <div className="px-6 py-3 flex items-center justify-between">
              <Button
                variant="outline"
                onClick={onBack}
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">返回首页</span>
              </Button>
              <div className="flex items-center gap-3">
                <img src="/favicon.svg" alt="Logo" className="w-8 h-8" />
                <span className="text-lg font-bold text-primary">
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
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
                <Rocket className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">Version 1.0 正式发布</span>
              </div>
              
              <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
                <span className="text-foreground">
                  用 AI 构建
                </span>
                <br />
                <span className="text-primary">
                  下一代 Web 应用
                </span>
              </h1>
              
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                AI Site Builder 是一个革命性的 Web 开发平台，让您通过自然语言对话即可创建专业级的 React 应用，无需编写一行代码。
              </p>

              <div className="flex items-center justify-center gap-4 pt-4">
                <Button
                  onClick={onBack}
                  size="lg"
                  className="px-8 py-4 h-auto rounded-2xl"
                >
                  立即开始构建
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  asChild
                  className="px-8 py-4 h-auto rounded-2xl"
                >
                  <a
                    href="https://github.com/pgd-LC2/aisitebuilder"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    查看源码
                  </a>
                </Button>
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
                  className="bg-card border border-border rounded-2xl p-6 text-center shadow-sm"
                >
                  <div className="text-4xl font-bold text-primary">
                    {stat.value}
                  </div>
                  <div className="text-sm text-muted-foreground mt-2">{stat.label}</div>
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
                <h2 className="text-3xl md:text-4xl font-bold text-foreground">
                  强大的功能特性
                </h2>
                <p className="text-muted-foreground max-w-xl mx-auto">
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
                    className="group relative bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300"
                  >
                    <div className="relative z-10">
                      <div className="w-12 h-12 rounded-xl bg-muted border border-border flex items-center justify-center mb-4">
                        <feature.icon className="w-6 h-6 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">
                        {feature.title}
                      </h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">
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
              className="bg-primary rounded-3xl p-12 text-center shadow-lg"
            >
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-foreground/20 mb-4">
                  <Cpu className="w-8 h-8 text-primary-foreground" />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground">
                  准备好开始了吗？
                </h2>
                <p className="text-primary-foreground/80 text-lg">
                  加入数千名开发者的行列，体验 AI 驱动的下一代 Web 开发方式
                </p>
                <Button
                  onClick={onBack}
                  size="lg"
                  variant="secondary"
                  className="px-8 py-4 h-auto rounded-2xl"
                >
                  免费开始使用
                </Button>
              </div>
            </motion.section>

            <motion.footer
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 1 }}
              className="text-center py-8 text-muted-foreground text-sm"
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
