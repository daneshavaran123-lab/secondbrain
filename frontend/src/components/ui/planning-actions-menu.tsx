import React from 'react';
import { Plus, Brain, UserCheck, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsMobile } from '@/hooks/use-mobile';
import { AppIcon } from '@/components/ui/app-icon';

interface PlanningActionsMenuProps {
  onNewTask: () => void;
  onOpenMentor: () => void;
  onOpenCoach: () => void;
  mentorLabel?: string;
  coachLabel?: string;
  newTaskLabel?: string;
  variant?: 'personal' | 'professional' | 'organizational';
}

export function PlanningActionsMenu({
  onNewTask,
  onOpenMentor,
  onOpenCoach,
  mentorLabel = "منتور AI",
  coachLabel = "کوچ AI", 
  newTaskLabel = "وظیفه جدید",
  variant = 'personal'
}: PlanningActionsMenuProps) {
  const isMobile = useIsMobile();
  // One look for every domain: an ink primary button and grey icons
  const colors = { primary: 'bg-primary hover:bg-primary-hover', mentor: 'text-muted-foreground', coach: 'text-muted-foreground' };


  return (
    <div className="flex gap-2">
      <Button 
        size={isMobile ? "sm" : "lg"}
        className={`${colors.primary} text-primary-foreground`}
        onClick={onNewTask}
      >
        <AppIcon size="sm">
          <Plus />
        </AppIcon>
        {isMobile ? 'جدید' : newTaskLabel}
      </Button>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            size={isMobile ? "sm" : "lg"} 
            variant="outline"
            className="border-2 border-primary/20 hover:bg-primary/5 shadow-luxury-soft"
          >
            <AppIcon size="sm">
              <MoreHorizontal />
            </AppIcon>
            {!isMobile && 'عملیات‌ها'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 bg-card/95 backdrop-blur-sm border shadow-luxury-elevated">
          <DropdownMenuItem onClick={onOpenMentor} className="cursor-pointer hover:bg-primary/10">
            <AppIcon size="sm">
              <Brain className={colors.mentor} />
            </AppIcon>
            {mentorLabel}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenCoach} className="cursor-pointer hover:bg-primary/10">
            <AppIcon size="sm">
              <UserCheck className={colors.coach} />
            </AppIcon>
            {coachLabel}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-xs text-muted-foreground cursor-default">
            کمک‌های هوش مصنوعی
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}