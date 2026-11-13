import React from 'react';
import { WorkBuddyWorkspace } from './components/WorkBuddyWorkspace';

export default function App() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      <WorkBuddyWorkspace />
    </div>
  );
}
