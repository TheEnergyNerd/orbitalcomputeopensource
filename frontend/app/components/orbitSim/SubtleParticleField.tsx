"use client";

import { useEffect, useRef, useState } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  baseAlpha: number;
}

interface SubtleParticleFieldProps {
  width: number;
  height: number;
  particleCount?: number;
  orbitShare?: number; // 0-1, affects particle movement
  isActive?: boolean; // Freeze when tab is not active
}

/**
 * Subtle particle field for background effects
 * 50-100 dots, slow drift, minor alpha changes
 * Reacts to orbit share growth (subtle movement)
 * Freezes when tab is not active
 */
export default function SubtleParticleField({
  width,
  height,
  particleCount = 75,
  orbitShare = 0,
  isActive = true,
}: SubtleParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number>();

  // Initialize particles
  useEffect(() => {
    if (!canvasRef.current) return;

    const particles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.2, // Slow drift
        vy: (Math.random() - 0.5) * 0.2,
        alpha: Math.random() * 0.3 + 0.1, // Subtle opacity
        baseAlpha: Math.random() * 0.3 + 0.1,
      });
    }
    particlesRef.current = particles;
  }, [width, height, particleCount]);

  // Animation loop
  useEffect(() => {
    if (!canvasRef.current || !isActive) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const animate = () => {
      if (!ctx) return;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Update and draw particles
      const time = Date.now() * 0.001;
      const orbitInfluence = orbitShare * 0.3; // Subtle influence from orbit share

      particlesRef.current.forEach((particle) => {
        // Update position
        particle.x += particle.vx + Math.sin(time + particle.x * 0.01) * orbitInfluence;
        particle.y += particle.vy + Math.cos(time + particle.y * 0.01) * orbitInfluence;

        // Wrap around edges
        if (particle.x < 0) particle.x = width;
        if (particle.x > width) particle.x = 0;
        if (particle.y < 0) particle.y = height;
        if (particle.y > height) particle.y = 0;

        // Subtle alpha pulsing
        particle.alpha = particle.baseAlpha + Math.sin(time * 2 + particle.x * 0.1) * 0.1;

        // Draw particle
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(148, 163, 184, ${particle.alpha})`; // slate-400 with varying alpha
        ctx.fill();
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [width, height, orbitShare, isActive]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}

