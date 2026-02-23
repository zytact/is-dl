import { motion } from 'motion/react';
import { ResultsDashboard } from '../components/ResultsDashboard';

export function ResultsPage() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="w-full h-full flex flex-col"
    >
      <ResultsDashboard />
    </motion.div>
  );
}
