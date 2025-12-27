import { Rocket, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useWorkflow } from '../../hooks/useWorkflow';
import { PlanSummary } from '../../types/project';
import { parseImplementReadyMarker } from '../../utils/implementReadyParser';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ImplementationTriggerProps {
  planSummary: PlanSummary;
  onImplement: () => void;
  disabled?: boolean;
}

export default function ImplementationTrigger({ planSummary, onImplement, disabled = false }: ImplementationTriggerProps) {
  const { enterBuildMode } = useWorkflow();

  const handleImplementClick = () => {
    if (disabled) return;
    enterBuildMode(planSummary);
    onImplement();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="my-4 mx-2"
    >
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm">规划已完成</CardTitle>
              <CardDescription className="text-xs line-clamp-2 mt-1">
                {planSummary.requirement}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {planSummary.implementationSteps.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium mb-1">实施步骤：</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {planSummary.implementationSteps.slice(0, 3).map((step, index) => (
                  <li key={index} className="flex items-start gap-1.5">
                    <span className="text-primary font-medium">{index + 1}.</span>
                    <span className="line-clamp-1">{step}</span>
                  </li>
                ))}
                {planSummary.implementationSteps.length > 3 && (
                  <li className="text-muted-foreground/70 text-xs">
                    ...还有 {planSummary.implementationSteps.length - 3} 个步骤
                  </li>
                )}
              </ul>
            </div>
          )}
          <Button
            onClick={handleImplementClick}
            disabled={disabled}
            className="w-full"
          >
            <Rocket className="w-4 h-4 mr-2" />
            开始实现
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface ImplementReadyMarkerProps {
  content: string;
}

export function ImplementReadyMarker({ content }: ImplementReadyMarkerProps) {
  const planSummary = parseImplementReadyMarker(content);

  if (!planSummary) {
    return null;
  }

  return (
    <ImplementationTrigger
      planSummary={planSummary}
      onImplement={() => {
        console.log('[ImplementReadyMarker] 用户点击开始实现');
      }}
    />
  );
}
