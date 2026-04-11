import React from 'react';
import './LandingPage.css';

export default function LandingPage() {
  return (
    <div className="landing-container">
      <div className="orb orb-pink"></div>
      <div className="orb orb-cyan"></div>
      
      <div className="landing-content">
        <h1 className="landing-title">ThinkPop</h1>
        <p className="landing-subtitle">
          Explore tough concepts with Baymax, your personal AI 3D teacher. 
          Vivid motion and voice-first explanations make every question easier to ask.
        </p>
        
        <a href="#/baymax" className="btn-use-baymax">
          Use Baymax
        </a>
      </div>
    </div>
  );
}
