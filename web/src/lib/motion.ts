import type { Variants } from 'motion/react';

export const staggerParent: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.035, delayChildren: 0.04 },
  },
};

export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.36, ease: [0.16, 1, 0.3, 1] },
  },
};

export const subtleFade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.4 } },
};
