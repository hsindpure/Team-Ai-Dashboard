import React, { useEffect, useRef } from 'react';

const ExactNorthernLightsPage = ({ onGetStarted, onToggleTheme, isDarkMode }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Mouse parallax effect
    const handleMouseMove = (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 30;
      const y = (e.clientY / window.innerHeight - 0.5) * 30;
      
      const auroras = container.querySelectorAll('.aurora-layer');
      auroras.forEach((aurora, index) => {
        const multiplier = (index + 1) * 0.5;
        aurora.style.transform = `translate(${x * multiplier}px, ${y * multiplier}px)`;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleJoinAdventure = () => {
    if (onGetStarted) {
      onGetStarted();
    }
  };

  return (
    <div className="northern-lights-container" ref={containerRef}>
      {/* Aurora Background Layers */}
      <div className="aurora-background">
        <div className="aurora-layer aurora-1"></div>
        <div className="aurora-layer aurora-2"></div>
        <div className="aurora-layer aurora-3"></div>
        <div className="aurora-layer aurora-4"></div>
        <div className="aurora-layer aurora-5"></div>
      </div>

      {/* Stars */}
      <div className="stars">
        {[...Array(100)].map((_, i) => (
          <div key={i} className={`star star-${i}`}></div>
        ))}
      </div>

      {/* Forest Silhouette */}
      <div className="forest-silhouette">
        <svg viewBox="0 0 1200 300" className="forest-svg">
          <path d="M0,300 L0,200 L50,180 L100,160 L150,140 L200,120 L250,100 L300,110 L350,130 L400,120 L450,100 L500,90 L550,110 L600,100 L650,80 L700,90 L750,110 L800,100 L850,120 L900,110 L950,130 L1000,140 L1050,160 L1100,180 L1150,200 L1200,220 L1200,300 Z" fill="#000"/>
          
          {/* Individual trees */}
          <polygon points="100,200 120,80 140,200" fill="#000"/>
          <polygon points="250,220 270,60 290,220" fill="#000"/>
          <polygon points="400,210 420,70 440,210" fill="#000"/>
          <polygon points="550,200 570,50 590,200" fill="#000"/>
          <polygon points="700,215 720,65 740,215" fill="#000"/>
          <polygon points="850,205 870,55 890,205" fill="#000"/>
          <polygon points="1000,220 1020,75 1040,220" fill="#000"/>
        </svg>
      </div>

      {/* Main Content */}
      <div className="content">
        <div className="date-badge">
          Running December 12th to 24th
        </div>
        
        <h1 className="main-heading">
          Witness the Majestic<br />
          Northern Lights
        </h1>
        
        <p className="description">
          A Breathtaking Journey to Nature's Most Spectacular Light Show
        </p>
        
        <button className="adventure-button" onClick={handleJoinAdventure}>
           Get Start
        </button>
      </div>

      <style jsx>{`
        .northern-lights-container {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          background: linear-gradient(180deg, 
            #0a0a1a 0%, 
            #1a1a2e 20%, 
            #2d1b69 40%, 
            #6b46c1 60%, 
            #9333ea 75%, 
            #c084fc 85%, 
            #e879f9 95%, 
            #f472b6 100%
          );
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          color: white;
        }

        .aurora-background {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }

        .aurora-layer {
          position: absolute;
          width: 120%;
          height: 120%;
          top: -10%;
          left: -10%;
          opacity: 0.8;
          mix-blend-mode: screen;
        }

        .aurora-1 {
          background: radial-gradient(ellipse 100% 50% at 20% 30%, 
            rgba(34, 197, 94, 0.4) 0%, 
            rgba(59, 130, 246, 0.3) 50%, 
            transparent 100%);
          animation: aurora-dance-1 15s ease-in-out infinite;
        }

        .aurora-2 {
          background: radial-gradient(ellipse 80% 60% at 70% 20%, 
            rgba(147, 51, 234, 0.5) 0%, 
            rgba(236, 72, 153, 0.4) 40%, 
            transparent 100%);
          animation: aurora-dance-2 20s ease-in-out infinite reverse;
        }

        .aurora-3 {
          background: radial-gradient(ellipse 90% 40% at 50% 40%, 
            rgba(59, 130, 246, 0.3) 0%, 
            rgba(34, 197, 94, 0.4) 60%, 
            transparent 100%);
          animation: aurora-dance-3 25s ease-in-out infinite;
        }

        .aurora-4 {
          background: radial-gradient(ellipse 70% 80% at 30% 60%, 
            rgba(236, 72, 153, 0.3) 0%, 
            rgba(147, 51, 234, 0.2) 50%, 
            transparent 100%);
          animation: aurora-dance-4 18s ease-in-out infinite reverse;
        }

        .aurora-5 {
          background: radial-gradient(ellipse 110% 30% at 80% 70%, 
            rgba(34, 197, 94, 0.2) 0%, 
            rgba(59, 130, 246, 0.3) 70%, 
            transparent 100%);
          animation: aurora-dance-5 22s ease-in-out infinite;
        }

        .stars {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 60%;
          pointer-events: none;
        }

        .star {
          position: absolute;
          background: white;
          border-radius: 50%;
          animation: twinkle 3s ease-in-out infinite;
        }

        /* Generate random star positions and sizes */
        ${[...Array(100)].map((_, i) => `
          .star-${i} {
            width: ${Math.random() * 3 + 1}px;
            height: ${Math.random() * 3 + 1}px;
            top: ${Math.random() * 60}%;
            left: ${Math.random() * 100}%;
            animation-delay: ${Math.random() * 3}s;
            opacity: ${Math.random() * 0.8 + 0.2};
          }
        `).join('')}

        .forest-silhouette {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 25%;
          z-index: 2;
        }

        .forest-svg {
          width: 100%;
          height: 100%;
        }

        .content {
          position: relative;
          z-index: 3;
          text-align: center;
          max-width: 800px;
          padding: 0 2rem;
          animation: fade-in-up 2s ease-out;
        }

        .date-badge {
          display: inline-block;
          padding: 12px 24px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 25px;
          font-size: 14px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.9);
          margin-bottom: 2rem;
          backdrop-filter: blur(20px);
          animation: gentle-pulse 3s ease-in-out infinite;
          letter-spacing: 0.5px;
        }

        .main-heading {
          font-size: 4.5rem;
          font-weight: 700;
          line-height: 1.1;
          margin: 0 0 1.5rem 0;
          color: white;
          text-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);
          letter-spacing: -0.02em;
          animation: title-shimmer 4s ease-in-out infinite;
        }

        .description {
          font-size: 1.4rem;
          font-weight: 400;
          color: rgba(255, 255, 255, 0.85);
          margin: 0 0 3rem 0;
          line-height: 1.6;
          text-shadow: 0 2px 15px rgba(0, 0, 0, 0.3);
          letter-spacing: 0.3px;
        }

        .adventure-button {
          display: inline-block;
          padding: 16px 40px;
          font-size: 1.1rem;
          font-weight: 600;
          color: rgba(0, 0, 0, 0.8);
          background: rgba(255, 255, 255, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.4);
          border-radius: 30px;
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          box-shadow: 
            0 15px 35px rgba(255, 255, 255, 0.1),
            inset 0 1px 0 rgba(255, 255, 255, 0.3);
          backdrop-filter: blur(20px);
          text-decoration: none;
          letter-spacing: 0.8px;
          position: relative;
          overflow: hidden;
        }

        .adventure-button::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
          transition: left 0.5s ease;
        }

        .adventure-button:hover {
          transform: translateY(-3px) scale(1.02);
          box-shadow: 
            0 25px 50px rgba(255, 255, 255, 0.2),
            inset 0 1px 0 rgba(255, 255, 255, 0.4);
          background: rgba(255, 255, 255, 1);
        }

        .adventure-button:hover::before {
          left: 100%;
        }

        .adventure-button:active {
          transform: translateY(-1px) scale(1.01);
        }

        @keyframes aurora-dance-1 {
          0%, 100% { 
            transform: translate(0%, 0%) rotate(0deg) scale(1);
            opacity: 0.6;
          }
          25% { 
            transform: translate(10%, -5%) rotate(1deg) scale(1.1);
            opacity: 0.8;
          }
          50% { 
            transform: translate(-5%, 10%) rotate(-0.5deg) scale(0.9);
            opacity: 1;
          }
          75% { 
            transform: translate(15%, -10%) rotate(0.8deg) scale(1.05);
            opacity: 0.7;
          }
        }

        @keyframes aurora-dance-2 {
          0%, 100% { 
            transform: translate(0%, 0%) rotate(0deg) scale(1);
            opacity: 0.5;
          }
          33% { 
            transform: translate(-15%, 8%) rotate(-1deg) scale(1.15);
            opacity: 0.8;
          }
          66% { 
            transform: translate(12%, -15%) rotate(1.2deg) scale(0.85);
            opacity: 0.9;
          }
        }

        @keyframes aurora-dance-3 {
          0%, 100% { 
            transform: translate(0%, 0%) rotate(0deg) scale(1);
            opacity: 0.4;
          }
          20% { 
            transform: translate(8%, 12%) rotate(2deg) scale(1.2);
            opacity: 0.6;
          }
          40% { 
            transform: translate(-10%, -8%) rotate(-1.5deg) scale(0.8);
            opacity: 0.9;
          }
          60% { 
            transform: translate(18%, 5%) rotate(1deg) scale(1.1);
            opacity: 0.7;
          }
          80% { 
            transform: translate(-5%, -12%) rotate(-0.5deg) scale(0.9);
            opacity: 0.5;
          }
        }

        @keyframes aurora-dance-4 {
          0%, 100% { 
            transform: translate(0%, 0%) rotate(0deg) scale(1);
            opacity: 0.3;
          }
          30% { 
            transform: translate(-12%, 15%) rotate(-2deg) scale(1.3);
            opacity: 0.7;
          }
          70% { 
            transform: translate(20%, -10%) rotate(1.5deg) scale(0.7);
            opacity: 0.8;
          }
        }

        @keyframes aurora-dance-5 {
          0%, 100% { 
            transform: translate(0%, 0%) rotate(0deg) scale(1);
            opacity: 0.2;
          }
          25% { 
            transform: translate(15%, -8%) rotate(1.8deg) scale(1.25);
            opacity: 0.5;
          }
          50% { 
            transform: translate(-8%, 20%) rotate(-1deg) scale(0.75);
            opacity: 0.8;
          }
          75% { 
            transform: translate(10%, -15%) rotate(0.5deg) scale(1.1);
            opacity: 0.4;
          }
        }

        @keyframes twinkle {
          0%, 100% { 
            opacity: 0.3;
            transform: scale(1);
          }
          50% { 
            opacity: 1;
            transform: scale(1.2);
          }
        }

        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(80px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes gentle-pulse {
          0%, 100% {
            opacity: 0.8;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.02);
          }
        }

        @keyframes title-shimmer {
          0%, 100% {
            text-shadow: 
              0 4px 30px rgba(0, 0, 0, 0.5),
              0 0 20px rgba(255, 255, 255, 0.1);
          }
          50% {
            text-shadow: 
              0 4px 30px rgba(0, 0, 0, 0.5),
              0 0 40px rgba(255, 255, 255, 0.2),
              0 0 60px rgba(147, 51, 234, 0.1);
          }
        }

        @media (max-width: 768px) {
          .main-heading {
            font-size: 3rem;
          }
          .description {
            font-size: 1.2rem;
          }
          .content {
            padding: 0 1.5rem;
          }
          .date-badge {
            font-size: 13px;
            padding: 10px 20px;
          }
          .adventure-button {
            padding: 14px 32px;
            font-size: 1rem;
          }
        }

        @media (max-width: 480px) {
          .main-heading {
            font-size: 2.2rem;
          }
          .description {
            font-size: 1.1rem;
          }
          .content {
            padding: 0 1rem;
          }
          .date-badge {
            font-size: 12px;
            padding: 8px 16px;
          }
          .adventure-button {
            padding: 12px 28px;
            font-size: 0.95rem;
          }
        }
      `}</style>
    </div>
  );
};

export default ExactNorthernLightsPage;