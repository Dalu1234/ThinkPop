import { motion, AnimatePresence } from 'framer-motion'

export default function TopicCard({ topic }) {
  return (
    <div className="topic-card-wrapper">
      <AnimatePresence mode="wait">
        <motion.div
          key={topic.label}
          className="topic-card"
          initial={{ opacity: 0, y: -12, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.92 }}
          transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <motion.span
            className="topic-emoji"
            key={topic.emoji}
            initial={{ rotate: -20, scale: 0.7 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ duration: 0.4, ease: 'backOut' }}
          >
            {topic.emoji}
          </motion.span>
          <span className="topic-label">{topic.label}</span>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
