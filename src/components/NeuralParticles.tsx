import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
}

/**
 * Full-screen canvas background animation.
 * Floating particles connected by lines when close together,
 * creating a neural-network visual effect on a light background.
 * Uses Penn Blue (#011F5B) with strong opacity for visibility on white.
 */
export default function NeuralParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let particles: Particle[] = [];
    let mouseX = -1000;
    let mouseY = -1000;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const createParticles = () => {
      particles = [];
      // More particles for denser network
      const particleCount = Math.floor((canvas.width * canvas.height) / 12000);

      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15,
          radius: Math.random() * 2.5 + 1.2,
          opacity: Math.random() * 0.4 + 0.3, // 0.3 - 0.7 range
        });
      }
    };

    const drawParticles = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw connections between nearby particles
      const connectionDistance = 180;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < connectionDistance) {
            const alpha = 0.18 * (1 - distance / connectionDistance);
            ctx.beginPath();
            ctx.strokeStyle = `rgba(1, 31, 91, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw connections to mouse (interactive glow)
      for (const particle of particles) {
        const dx = particle.x - mouseX;
        const dy = particle.y - mouseY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 200) {
          const alpha = 0.25 * (1 - distance / 200);
          ctx.beginPath();
          ctx.strokeStyle = `rgba(109, 211, 206, ${alpha})`; // Teal for mouse connections
          ctx.lineWidth = 1.2;
          ctx.moveTo(particle.x, particle.y);
          ctx.lineTo(mouseX, mouseY);
          ctx.stroke();
        }
      }

      // Draw particles
      for (const particle of particles) {
        // Check mouse proximity for highlight
        const dx = particle.x - mouseX;
        const dy = particle.y - mouseY;
        const mouseDist = Math.sqrt(dx * dx + dy * dy);
        const isNearMouse = mouseDist < 200;

        ctx.beginPath();
        ctx.arc(particle.x, particle.y, isNearMouse ? particle.radius * 1.4 : particle.radius, 0, Math.PI * 2);

        if (isNearMouse) {
          // Teal glow near cursor
          const glowAlpha = particle.opacity * (1 - mouseDist / 200) + 0.3;
          ctx.fillStyle = `rgba(109, 211, 206, ${Math.min(glowAlpha, 0.9)})`;
        } else {
          ctx.fillStyle = `rgba(1, 31, 91, ${particle.opacity * 0.6})`;
        }
        ctx.fill();
      }
    };

    const updateParticles = () => {
      for (const particle of particles) {
        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;
      }
    };

    const animate = () => {
      updateParticles();
      drawParticles();
      animationId = requestAnimationFrame(animate);
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const handleMouseLeave = () => {
      mouseX = -1000;
      mouseY = -1000;
    };

    resize();
    createParticles();
    animate();

    const handleResize = () => {
      resize();
      createParticles();
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ background: 'transparent' }}
    />
  );
}
