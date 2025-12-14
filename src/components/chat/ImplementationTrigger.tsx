import { Rocket, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useWorkflow } from '../../hooks/useWorkflow';
import { PlanSummary } from '../../types/project';
import { parseImplementReadyMarker } from '../../utils/implementReadyParser';

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
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              规划已完成
            </h3>
            <p className="text-xs text-gray-600 mb-3 line-clamp-2">
              {planSummary.requirement}
            </p>
            {planSummary.implementationSteps.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-700 mb-1">实施步骤：</p>
                <ul className="text-xs text-gray-600 space-y-0.5">
                  {planSummary.implementationSteps.slice(0, 3).map((step, index) => (
                    <li key={index} className="flex items-start gap-1.5">
                      <span className="text-blue-500 font-medium">{index + 1}.</span>
                      <span className="line-clamp-1">{step}</span>
                    </li>
                  ))}
                  {planSummary.implementationSteps.length > 3 && (
                    <li className="text-gray-400 text-xs">
                      ...还有 {planSummary.implementationSteps.length - 3} 个步骤
                    </li>
                  )}
                </ul>
              </div>
            )}
            <motion.button
              onClick={handleImplementClick}
              whileHover={disabled ? {} : { scale: 1.02 }}
              whileTap={disabled ? {} : { scale: 0.98 }}
              disabled={disabled}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg shadow-sm transition-all duration-200 ${
                disabled
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white'
              }`}
            >
              <Rocket className="w-4 h-4" />
              开始实现
            </motion.button>
          </div>
        </div>
      </div>
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
