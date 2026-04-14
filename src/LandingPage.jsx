import React from 'react';
import './LandingPage.css';
import ThreeBackground from './components/ThreeBackground';
import KnowledgeNebula from './components/KnowledgeNebula';

export default function LandingPage() {
  return (
    <div className="landing-container">
      <ThreeBackground mode="space-only" />
      
      <div className="landing-hero">
        <div className="landing-content">
          <h1 className="landing-title">ThinkPop</h1>
          <p className="landing-subtitle">
            Explore tough concepts with Mabi, your personal AI 3D teacher. 
            Vivid motion and voice-first explanations make every question easier to ask.
          </p>
          
          <div className="landing-actions">
            <a href="#/baymax" className="btn-use-baymax">
              Use Mabi
            </a>
            <a href="#/baymax-voice2" className="btn-use-baymax btn-use-baymax-secondary">
              Voice-first tutor (dots)
            </a>
          </div>
        </div>

        <div className="landing-nebula">
          <KnowledgeNebula />
        </div>
      </div>
    </div>
  );
}
