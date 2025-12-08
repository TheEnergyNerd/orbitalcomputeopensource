/**
 * Sentiment Particle Field
 * Volumetric particle system showing market mood in forecast space
 * Particles drift based on sentiment, density based on volatility
 */

"use client";

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CatmullRomCurve3 } from 'three';
import type { SentimentSnapshot } from '@/app/lib/futures/types';

interface SentimentParticleFieldProps {
  sentiment: SentimentSnapshot | null;
  earthRadius: number;
  ribbonAltitude: number;
  torusRadius: number; // Small radius around ribbon
  scene: THREE.Scene;
  maxParticles?: number;
}

export default function SentimentParticleField({
  sentiment,
  earthRadius,
  ribbonAltitude,
  torusRadius,
  scene,
  maxParticles = 500,
}: SentimentParticleFieldProps) {
  const particlesRef = useRef<THREE.Points | null>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const materialRef = useRef<THREE.PointsMaterial | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const velocitiesRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    if (!sentiment) return;

    // Create particle geometry
    const geometry = new THREE.BufferGeometry();
    const particleCount = Math.floor(maxParticles * (0.5 + sentiment.volatilityLevel));
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    // Create curve for ribbon (same as FuturesRibbon)
    const radius = earthRadius + ribbonAltitude;
    const numCurvePoints = 64;
    const curvePoints: THREE.Vector3[] = [];

    for (let i = 0; i <= numCurvePoints; i++) {
      const angle = (i / numCurvePoints) * Math.PI * 2;
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);
      const y = 0;
      curvePoints.push(new THREE.Vector3(x, y, z));
    }

    const curve = new CatmullRomCurve3(curvePoints);
    curve.closed = true;

    // Initialize particles in torus around ribbon
    for (let i = 0; i < particleCount; i++) {
      const t = Math.random();
      const basePos = curve.getPoint(t);
      
      // Random offset in torus
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 2;
      const offsetX = torusRadius * Math.cos(theta) * Math.sin(phi);
      const offsetY = torusRadius * Math.sin(theta);
      const offsetZ = torusRadius * Math.cos(theta) * Math.cos(phi);
      
      positions[i * 3] = basePos.x + offsetX;
      positions[i * 3 + 1] = basePos.y + offsetY;
      positions[i * 3 + 2] = basePos.z + offsetZ;

      // Initial velocity with sentiment bias
      const baseSpeed = 0.001 + sentiment.volatilityLevel * 0.002;
      const sentimentBias = sentiment.orbitSentiment * 0.01; // Vertical drift
      const volatilityJitter = (Math.random() - 0.5) * sentiment.volatilityLevel * 0.01;
      
      velocities[i * 3] = (Math.random() - 0.5) * baseSpeed + volatilityJitter;
      velocities[i * 3 + 1] = sentimentBias + volatilityJitter; // Sentiment affects Y
      velocities[i * 3 + 2] = (Math.random() - 0.5) * baseSpeed + volatilityJitter;

      // Color based on sentiment (green = bullish, red = bearish)
      const sentimentColor = sentiment.orbitSentiment > 0
        ? new THREE.Color(0x00ff88) // Green (bullish)
        : new THREE.Color(0xff4444); // Red (bearish)
      
      colors[i * 3] = sentimentColor.r;
      colors[i * 3 + 1] = sentimentColor.g;
      colors[i * 3 + 2] = sentimentColor.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometryRef.current = geometry;
    velocitiesRef.current = velocities;

    // Create material
    const material = new THREE.PointsMaterial({
      size: 0.02,
      vertexColors: true,
      transparent: true,
      opacity: 0.6 * (0.3 + sentiment.volatilityLevel * 0.7),
      blending: THREE.AdditiveBlending,
    });
    materialRef.current = material;

    const points = new THREE.Points(geometry, material);
    points.name = 'sentiment-particles';
    scene.add(points);
    particlesRef.current = points;

    // Animate particles
    const animate = () => {
      if (!particlesRef.current || !geometryRef.current || !velocitiesRef.current || !sentiment) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      const positions = geometryRef.current.attributes.position.array as Float32Array;
      const velocities = velocitiesRef.current;

      for (let i = 0; i < particleCount; i++) {
        // Update position
        positions[i * 3] += velocities[i * 3];
        positions[i * 3 + 1] += velocities[i * 3 + 1];
        positions[i * 3 + 2] += velocities[i * 3 + 2];

        // Update velocity with sentiment and volatility
        const sentimentBias = sentiment.orbitSentiment * 0.0001;
        const volatilityJitter = (Math.random() - 0.5) * sentiment.volatilityLevel * 0.0001;
        
        velocities[i * 3 + 1] += sentimentBias + volatilityJitter;

        // Wrap around torus (keep particles near ribbon)
        const pos = new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
        const distanceFromCenter = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
        const expectedRadius = radius;
        
        if (Math.abs(distanceFromCenter - expectedRadius) > torusRadius * 2) {
          // Reset particle to random position on ribbon
          const t = Math.random();
          const basePos = curve.getPoint(t);
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.random() * Math.PI * 2;
          
          positions[i * 3] = basePos.x + torusRadius * Math.cos(theta) * Math.sin(phi);
          positions[i * 3 + 1] = basePos.y + torusRadius * Math.sin(theta);
          positions[i * 3 + 2] = basePos.z + torusRadius * Math.cos(theta) * Math.cos(phi);
        }
      }

      geometryRef.current.attributes.position.needsUpdate = true;
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (particlesRef.current) {
        scene.remove(particlesRef.current);
        geometryRef.current?.dispose();
        materialRef.current?.dispose();
        particlesRef.current = null;
        geometryRef.current = null;
        materialRef.current = null;
        velocitiesRef.current = null;
      }
    };
  }, [sentiment, earthRadius, ribbonAltitude, torusRadius, scene, maxParticles]);

  return null;
}

