import React, { useState, useCallback } from 'react';
import { Button } from '../button';
import { Input } from '../input';
import { StartOfDayCandidate } from '../../application/use-cases/GetStartOfDayCandidatesUseCase';
import { TaskSelection, TaskAction } from '../../application/use-cases/ConfirmStartOfDayUseCase';
import { TaskCategory, TaskPriority } from '../../domain/types';

interface TaskCandidateItemProps {
  /** Task candidate */
  candidate: StartOfDayCandidate;
  /** Current selection for this task */
  selection?: TaskSelection;
  /** Callback when task is selected */
  onSelection: (taskId: string, action: TaskAction, deferDate?: string) => void;
  /** Callback when task is deselected */
  onDeselection: (taskId: string) => void;
}

/**
 * Individual task candidate item component
 */
export const TaskCandidateItem: React.FC<TaskCandidateItemProps> = ({
  candidate,
  selection,
  onSelection,
  onDeselection
}) => {
  const [showActions, setShowActions] = useState(false);
  const [showDeferInput, setShowDeferInput] = useState(false);
  const [deferDate, setDeferDate] = useState('');

  const { task, category, daysInCategory } = candidate;
  const isSelected = !!selection;

  // Handle action selection
  const handleAction = useCallback((action: TaskAction, deferDate?: string) => {
    if (action === 'defer' && !deferDate) {
      setShowDeferInput(true);
      setDeferDate(getTomorrowDate());
      return;
    }
    
    onSelection(task.id, action, deferDate);
    setShowActions(false);
    setShowDeferInput(false);
  }, [task.id, onSelection]);

  // Handle deselection
  const handleDeselect = useCallback(() => {
    onDeselection(task.id);
    setShowActions(false);
    setShowDeferInput(false);
  }, [task.id, onDeselection]);

  // Handle defer with date
  const handleDeferWithDate = useCallback(() => {
    if (deferDate) {
      onSelection(task.id, 'defer', deferDate);
      setShowDeferInput(false);
      setShowActions(false);
    }
  }, [task.id, deferDate, onSelection]);

  // Get tomorrow's date as default
  const getTomorrowDate = useCallback(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }, []);

  // Get priority icon
  const getPriorityIcon = (priority: TaskPriority) => {
    switch (priority) {
      case TaskPriority.HIGH:
        return '🔴';
      case TaskPriority.MEDIUM:
        return '🟡';
      case TaskPriority.LOW:
        return '🟢';
      default:
        return '';
    }
  };

  // Get category badge
  const getCategoryInfo = () => {
    switch (category) {
      case 'due_today':
        return { text: 'Срок сегодня', color: '#059669' };
      case 'overdue':
        return { text: 'Просрочено', color: '#dc2626' };
      case 'returning':
        return { text: 'Вернулось', color: '#3b82f6' };
      case 'missed':
        return { text: 'Пропущено', color: '#6b7280' };
      case 'stale_inbox':
        return { 
          text: `Инбокс ${daysInCategory}д`, 
          color: '#f59e0b' 
        };
      default:
        return { text: '', color: '#6b7280' };
    }
  };

  const categoryInfo = getCategoryInfo();

  // Format due date
  const formatDueDate = (date: Date) => {
    const today = new Date();
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'сегодня';
    if (diffDays === 1) return 'завтра';
    if (diffDays === -1) return 'вчера';
    if (diffDays < 0) return `${Math.abs(diffDays)} дн. назад`;
    return `через ${diffDays} дн.`;
  };

  // Get action label
  const getActionLabel = (action: TaskAction) => {
    switch (action) {
      case 'add_to_today':
        return 'В Сегодня';
      case 'defer':
        return 'Отложить';
      case 'move_to_backlog':
        return 'В Бэклог';
      case 'archive':
        return 'В Архив';
      case 'delete':
        return 'Удалить';
      case 'mark_done':
        return 'Готово';
      default:
        return action;
    }
  };

  return (
    <div className={`task-candidate-item ${isSelected ? 'task-candidate-item--selected' : ''}`}>
      <div className="task-candidate-item__main">
        <div className="task-candidate-item__content">
          <div className="task-candidate-item__header">
            <div className="task-candidate-item__title">
              {getPriorityIcon(task.priority)}
              <span className="task-candidate-item__title-text">{task.title}</span>
            </div>
            
            <div className="task-candidate-item__badges">
              {categoryInfo.text && (
                <span 
                  className="task-candidate-item__category-badge"
                  style={{ color: categoryInfo.color }}
                >
                  {categoryInfo.text}
                </span>
              )}
              
              {task.deferredUntil && (
                <span className="task-candidate-item__due-date">
                  {formatDueDate(task.deferredUntil)}
                </span>
              )}
            </div>
          </div>
          
          {task.description && (
            <div className="task-candidate-item__description">
              {task.description}
            </div>
          )}
        </div>

        <div className="task-candidate-item__actions">
          {!isSelected ? (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleAction('add_to_today')}
                title="В Сегодня (R)"
              >
                В Сегодня
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowActions(!showActions)}
                title="Больше действий"
              >
                ⋯
              </Button>
            </>
          ) : (
            <div className="task-candidate-item__selected">
              <span className="task-candidate-item__selected-label">
                {getActionLabel(selection.action)}
                {selection.deferDate && ` (${selection.deferDate})`}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeselect}
                title="Отменить выбор"
              >
                ✕
              </Button>
            </div>
          )}
        </div>
      </div>

      {showActions && !isSelected && (
        <div className="task-candidate-item__action-menu">
          {!showDeferInput ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleAction('defer')}
                title="Отложить (S)"
              >
                Отложить на...
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleAction('move_to_backlog')}
              >
                В Бэклог
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleAction('mark_done')}
              >
                Готово
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleAction('delete')}
                title="Удалить (Del)"
                className="task-candidate-item__delete-button"
              >
                Удалить
              </Button>
            </>
          ) : (
            <div className="task-candidate-item__defer-input">
              <Input
                type="date"
                value={deferDate}
                onChange={(e) => setDeferDate(e.target.value)}
                min={getTomorrowDate()}
                className="task-candidate-item__defer-date"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleDeferWithDate}
                disabled={!deferDate}
              >
                ✓
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeferInput(false)}
              >
                ✕
              </Button>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .task-candidate-item {
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          background: white;
          transition: all 0.2s;
        }
        
        .task-candidate-item:hover {
          border-color: #d1d5db;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .task-candidate-item--selected {
          border-color: #059669;
          background: #f0fdf4;
        }
        
        .task-candidate-item__main {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px;
        }
        
        .task-candidate-item__content {
          flex: 1;
          min-width: 0;
        }
        
        .task-candidate-item__header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 4px;
        }
        
        .task-candidate-item__title {
          display: flex;
          align-items: center;
          gap: 6px;
          flex: 1;
          min-width: 0;
        }
        
        .task-candidate-item__title-text {
          font-weight: 500;
          color: #1f2937;
          word-break: break-word;
        }
        
        .task-candidate-item__badges {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        
        .task-candidate-item__category-badge {
          font-size: 12px;
          font-weight: 500;
          padding: 2px 6px;
          border-radius: 4px;
          background: currentColor;
          color: white !important;
          opacity: 0.9;
        }
        
        .task-candidate-item__due-date {
          font-size: 12px;
          color: #6b7280;
          background: #f3f4f6;
          padding: 2px 6px;
          border-radius: 4px;
        }
        
        .task-candidate-item__description {
          font-size: 14px;
          color: #6b7280;
          margin-top: 4px;
          word-break: break-word;
        }
        
        .task-candidate-item__actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        
        .task-candidate-item__selected {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 8px;
          background: #dcfce7;
          border-radius: 4px;
        }
        
        .task-candidate-item__selected-label {
          font-size: 12px;
          font-weight: 500;
          color: #059669;
        }
        
        .task-candidate-item__action-menu {
          border-top: 1px solid #e5e7eb;
          padding: 8px 12px;
          background: #f9fafb;
        }
        
        .task-candidate-item__action-menu {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        
        .task-candidate-item__defer-input {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
        }
        
        .task-candidate-item__defer-date {
          flex: 1;
          min-width: 140px;
        }
        
        .task-candidate-item__delete-button {
          color: #dc2626 !important;
        }
        
        .task-candidate-item__delete-button:hover {
          background: #fef2f2 !important;
        }
        
        @media (max-width: 640px) {
          .task-candidate-item__main {
            flex-direction: column;
            gap: 8px;
          }
          
          .task-candidate-item__actions {
            align-self: stretch;
            justify-content: center;
          }
          
          .task-candidate-item__action-menu {
            flex-direction: column;
          }
          
          .task-candidate-item__defer-input {
            flex-direction: column;
          }
          
          .task-candidate-item__defer-date {
            min-width: auto;
          }
        }
      `}</style>
    </div>
  );
};

export default TaskCandidateItem;