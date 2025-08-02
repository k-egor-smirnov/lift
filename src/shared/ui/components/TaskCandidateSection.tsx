import React, { useState, useCallback } from 'react';
import { Button } from '../button';
import { Input } from '../input';
import { StartOfDayCandidate } from '../../application/use-cases/GetStartOfDayCandidatesUseCase';
import { TaskSelection, TaskAction } from '../../application/use-cases/ConfirmStartOfDayUseCase';
import { TaskCandidateItem } from './TaskCandidateItem';

interface TaskCandidateSectionProps {
  /** Section title */
  title: string;
  /** Tasks in this section */
  tasks: StartOfDayCandidate[];
  /** Whether section is expanded */
  isExpanded: boolean;
  /** Callback when section is toggled */
  onToggle: () => void;
  /** Current selections */
  selections: Map<string, TaskSelection>;
  /** Callback when task is selected */
  onTaskSelection: (taskId: string, action: TaskAction, deferDate?: string) => void;
  /** Callback when task is deselected */
  onTaskDeselection: (taskId: string) => void;
  /** Callback when "Select All" is clicked */
  onSelectAll: () => void;
  /** Callback when "Defer All" is clicked */
  onDeferAll: (deferDate: string) => void;
  /** Visual variant */
  variant?: 'default' | 'warning' | 'info' | 'secondary' | 'muted';
}

/**
 * Section component for grouping task candidates in start of day modal
 */
export const TaskCandidateSection: React.FC<TaskCandidateSectionProps> = ({
  title,
  tasks,
  isExpanded,
  onToggle,
  selections,
  onTaskSelection,
  onTaskDeselection,
  onSelectAll,
  onDeferAll,
  variant = 'default'
}) => {
  const [showDeferInput, setShowDeferInput] = useState(false);
  const [deferDate, setDeferDate] = useState('');

  // Calculate selection stats
  const selectedCount = tasks.filter(task => selections.has(task.task.id)).length;
  const totalCount = tasks.length;

  // Handle defer all
  const handleDeferAll = useCallback(() => {
    if (deferDate) {
      onDeferAll(deferDate);
      setShowDeferInput(false);
      setDeferDate('');
    }
  }, [deferDate, onDeferAll]);

  // Handle cancel defer
  const handleCancelDefer = useCallback(() => {
    setShowDeferInput(false);
    setDeferDate('');
  }, []);

  // Get tomorrow's date as default
  const getTomorrowDate = useCallback(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }, []);

  // Variant styles
  const getVariantStyles = (variant: string) => {
    switch (variant) {
      case 'warning':
        return {
          borderColor: '#f59e0b',
          headerBg: '#fef3c7',
          headerColor: '#92400e'
        };
      case 'info':
        return {
          borderColor: '#3b82f6',
          headerBg: '#dbeafe',
          headerColor: '#1e40af'
        };
      case 'secondary':
        return {
          borderColor: '#6b7280',
          headerBg: '#f3f4f6',
          headerColor: '#374151'
        };
      case 'muted':
        return {
          borderColor: '#d1d5db',
          headerBg: '#f9fafb',
          headerColor: '#6b7280'
        };
      default:
        return {
          borderColor: '#e5e7eb',
          headerBg: '#f8fafc',
          headerColor: '#1f2937'
        };
    }
  };

  const variantStyles = getVariantStyles(variant);

  return (
    <div className="task-candidate-section">
      <div 
        className="task-candidate-section__header"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <div className="task-candidate-section__title">
          <span className="task-candidate-section__toggle-icon">
            {isExpanded ? '▼' : '▶'}
          </span>
          <span className="task-candidate-section__title-text">{title}</span>
          <span className="task-candidate-section__count">
            ({totalCount})
          </span>
          {selectedCount > 0 && (
            <span className="task-candidate-section__selected-count">
              • {selectedCount} выбрано
            </span>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="task-candidate-section__content">
          <div className="task-candidate-section__actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={onSelectAll}
              disabled={totalCount === 0}
            >
              Выбрать все (A)
            </Button>
            
            {!showDeferInput ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowDeferInput(true);
                  setDeferDate(getTomorrowDate());
                }}
                disabled={totalCount === 0}
              >
                Отложить все на... (S)
              </Button>
            ) : (
              <div className="task-candidate-section__defer-input">
                <Input
                  type="date"
                  value={deferDate}
                  onChange={(e) => setDeferDate(e.target.value)}
                  className="task-candidate-section__defer-date"
                  min={getTomorrowDate()}
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleDeferAll}
                  disabled={!deferDate}
                >
                  ✓
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelDefer}
                >
                  ✕
                </Button>
              </div>
            )}
          </div>

          <div className="task-candidate-section__tasks">
            {tasks.map((candidate) => (
              <TaskCandidateItem
                key={candidate.task.id}
                candidate={candidate}
                selection={selections.get(candidate.task.id)}
                onSelection={onTaskSelection}
                onDeselection={onTaskDeselection}
              />
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        .task-candidate-section {
          border: 1px solid ${variantStyles.borderColor};
          border-radius: 8px;
          overflow: hidden;
        }
        
        .task-candidate-section__header {
          background: ${variantStyles.headerBg};
          padding: 12px 16px;
          cursor: pointer;
          user-select: none;
          transition: background-color 0.2s;
        }
        
        .task-candidate-section__header:hover {
          background: ${variantStyles.headerBg};
          filter: brightness(0.95);
        }
        
        .task-candidate-section__header:focus {
          outline: 2px solid #3b82f6;
          outline-offset: -2px;
        }
        
        .task-candidate-section__title {
          display: flex;
          align-items: center;
          gap: 8px;
          color: ${variantStyles.headerColor};
          font-weight: 500;
        }
        
        .task-candidate-section__toggle-icon {
          font-size: 12px;
          width: 16px;
          text-align: center;
        }
        
        .task-candidate-section__title-text {
          flex: 1;
        }
        
        .task-candidate-section__count {
          font-weight: 400;
          opacity: 0.8;
        }
        
        .task-candidate-section__selected-count {
          color: #059669;
          font-weight: 500;
          font-size: 14px;
        }
        
        .task-candidate-section__content {
          padding: 16px;
        }
        
        .task-candidate-section__actions {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        
        .task-candidate-section__defer-input {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .task-candidate-section__defer-date {
          width: 140px;
        }
        
        .task-candidate-section__tasks {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        @media (max-width: 640px) {
          .task-candidate-section__actions {
            flex-direction: column;
          }
          
          .task-candidate-section__defer-input {
            flex-direction: column;
            align-items: stretch;
          }
          
          .task-candidate-section__defer-date {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default TaskCandidateSection;