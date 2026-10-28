import React from 'react';
import { OrgKanbanBoard } from './OrgKanbanBoard';

interface OrgScrumBoardProps {
  domain: 'personal' | 'professional' | 'organizational';
}

export const OrgScrumBoard: React.FC<OrgScrumBoardProps> = ({ domain }) => {
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">نمای اسکرام: صف کارها، در حال انجام، بازبینی، انجام‌شده</div>
      <OrgKanbanBoard domain={domain} />
    </div>
  );
};
