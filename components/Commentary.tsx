import React from 'react';

interface CommentaryProps {
  text: string;
}

export const Commentary: React.FC<CommentaryProps> = ({ text }) => {
  if (!text) return null;

  return (
    <div className="max-w-2xl mx-auto mt-6 mb-2">
      <div className="flex items-start gap-3 bg-slate-800/50 border border-slate-700/50 p-4 rounded-xl backdrop-blur-sm">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-xs font-bold text-white">
          AI
        </div>
        <p className="text-slate-300 text-sm leading-relaxed italic">
          "{text}"
        </p>
      </div>
    </div>
  );
};