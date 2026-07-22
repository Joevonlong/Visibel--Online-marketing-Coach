"use client";

import * as React from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

import { cn } from "@/lib/utils";

export type FadeRiseProps = React.PropsWithChildren<{
  className?: string;
  /** Animation delay in seconds. */
  delay?: number;
  /** Rise distance in px (ignored under `prefers-reduced-motion`). */
  y?: number;
  /** Replay every time the section re-enters the viewport instead of once. */
  once?: boolean;
}>;

/** Fade + rise-on-scroll wrapper; degrades to a plain cross-fade under `prefers-reduced-motion`. */
export function FadeRise({ children, className, delay = 0, y = 24, once = true }: FadeRiseProps) {
  const shouldReduceMotion = useReducedMotion();

  const variants: Variants = shouldReduceMotion
    ? { hidden: { opacity: 0 }, visible: { opacity: 1 } }
    : { hidden: { opacity: 0, y }, visible: { opacity: 1, y: 0 } };

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: "-80px" }}
      variants={variants}
      transition={{ duration: shouldReduceMotion ? 0.2 : 0.3, ease: "easeOut", delay }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
