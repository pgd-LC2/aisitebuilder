import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProjectCard } from '@/components/project';

const exampleCards = [
  {
    title: 'SaaS 营销站',
    description: '为增长团队准备的高转化落地页模板。',
  },
  {
    title: '作品集展示',
    description: '极简风格的创作者主页与作品陈列。',
  },
  {
    title: '电商启动页',
    description: '突出新品与优惠组合的促销页面。',
  },
  {
    title: '移动应用官网',
    description: '强调下载、功能与用户评价。',
  },
  {
    title: '活动报名页',
    description: '带日程与嘉宾介绍的活动 landing。',
  },
  {
    title: 'AI 工具目录',
    description: '清晰分类与筛选的产品目录页。',
  },
];

interface HomeShowcaseProps {
  recentProjects: any[];
  onViewAllProjects: () => void;
  onProjectClick: (project: any) => void;
}

export default function HomeShowcase({ recentProjects, onViewAllProjects, onProjectClick }: HomeShowcaseProps) {
  const hasRecentProjects = recentProjects.length > 0;

  return (
    <section className="border-t border-border bg-muted/30 py-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Recent / Showcase</p>
            <h2 className="text-2xl font-semibold text-foreground">示例与最近的项目</h2>
          </div>
          <Button variant="ghost" onClick={onViewAllProjects} className="gap-2 self-start sm:self-auto">
            查看全部
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        <Tabs defaultValue="recent" className="space-y-6">
          <TabsList>
            <TabsTrigger value="recent">最近项目</TabsTrigger>
            <TabsTrigger value="examples">Examples</TabsTrigger>
          </TabsList>

          <TabsContent value="recent">
            {hasRecentProjects ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {recentProjects.map((project) => (
                  <ProjectCard key={project.id} project={project} onClick={() => onProjectClick(project)} />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {exampleCards.slice(0, 3).map((item) => (
                  <Card key={item.title} className="border-dashed">
                    <CardHeader>
                      <CardTitle className="text-base">{item.title}</CardTitle>
                      <CardDescription>{item.description}</CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="examples">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {exampleCards.map((item) => (
                <Card key={item.title}>
                  <CardHeader>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
