import React, { useState, useCallback, useMemo } from 'react';
import { Modal, ModalBody, ModalFooter } from '../Modal';
import { Button } from '../button';
import { Task } from '../../domain/entities/Task';
import { StartOfDayCandidate, StartOfDayCandidateGroups } from '../../application/use-cases/GetStartOfDayCandidatesUseCase';
import { TaskSelection, TaskAction } from '../../application/use-cases/ConfirmStartOfDayUseCase';
import { TaskCandidateSection } from './TaskCandidateSection';

interface StartOfDayModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Date for the start of day (YYYY-MM-DD format) */
  date: string;
  /** Grouped candidates for selection */
  candidates: StartOfDayCandidateGroups;
  /** Whether restore option is available */
  isRestoreAvailable: boolean;
  /** Callback when "Form Today" is clicked */
  onConfirm: (selections: TaskSelection[]) => void;
  /** Callback when "Restore" is clicked */
  onRestore?: () => void;
  /** Callback when "Later" is clicked */
  onLater?: () => void;
  /** Loading state */
  isLoading?: boolean;
}

/**
 * Modal component for start of day task selection
 * Implements the "Начать день" modal functionality
 */
export const StartOfDayModal: React.FC<StartOfDayModalProps> = ({
  isOpen,
  onClose,
  date,
  candidates,
  isRestoreAvailable,
  onConfirm,
  onRestore,
  onLater,
  isLoading = false
}) => {
  // Debug alert to check if component is rendered
  if (isOpen) {
    console.log('StartOfDayModal is open!');
  }
  const [selections, setSelections] = useState<Map<string, TaskSelection>>(new Map());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['dueToday', 'overdue']));

  // Calculate total counts
  const totalCounts = useMemo(() => {
    if (!candidates) {
      return {
        dueToday: 0,
        overdue: 0,
        returning: 0,
        missed: 0,
        staleInbox: 0,
        total: 0
      };
    }
    
    return {
      dueToday: candidates.dueToday?.length || 0,
      overdue: candidates.overdue?.length || 0,
      returning: candidates.returning?.length || 0,
      missed: candidates.missed?.length || 0,
      staleInbox: candidates.staleInbox?.length || 0,
      total: Object.values(candidates).reduce((sum, group) => sum + (group?.length || 0), 0)
    };
  }, [candidates]);

  // Handle task selection
  const handleTaskSelection = useCallback((taskId: string, action: TaskAction, deferDate?: string) => {
    setSelections(prev => {
      const newSelections = new Map(prev);
      if (action === 'add_to_today') {
        newSelections.set(taskId, { taskId, action });
      } else {
        newSelections.set(taskId, { taskId, action, deferDate });
      }
      return newSelections;
    });
  }, []);

  // Handle task deselection
  const handleTaskDeselection = useCallback((taskId: string) => {
    setSelections(prev => {
      const newSelections = new Map(prev);
      newSelections.delete(taskId);
      return newSelections;
    });
  }, []);

  // Handle section toggle
  const handleSectionToggle = useCallback((sectionKey: string) => {
    setExpandedSections(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(sectionKey)) {
        newExpanded.delete(sectionKey);
      } else {
        newExpanded.add(sectionKey);
      }
      return newExpanded;
    });
  }, []);

  // Handle select all in section
  const handleSelectAllInSection = useCallback((sectionKey: string, tasks: StartOfDayCandidate[]) => {
    setSelections(prev => {
      const newSelections = new Map(prev);
      tasks.forEach(candidate => {
        newSelections.set(candidate.task.id, {
          taskId: candidate.task.id,
          action: 'add_to_today'
        });
      });
      return newSelections;
    });
  }, []);

  // Handle defer all in section
  const handleDeferAllInSection = useCallback((sectionKey: string, tasks: StartOfDayCandidate[], deferDate: string) => {
    setSelections(prev => {
      const newSelections = new Map(prev);
      tasks.forEach(candidate => {
        newSelections.set(candidate.task.id, {
          taskId: candidate.task.id,
          action: 'defer',
          deferDate
        });
      });
      return newSelections;
    });
  }, []);

  // Handle confirm
  const handleConfirm = useCallback(() => {
    const selectionArray = Array.from(selections.values());
    onConfirm(selectionArray);
  }, [selections, onConfirm]);

  // Handle close
  const handleClose = useCallback(() => {
    if (onLater) {
      onLater();
    } else {
      onClose();
    }
  }, [onClose, onLater]);

  // Format date for display
  const formattedDate = useMemo(() => {
    try {
      const dateObj = new Date(date + 'T00:00:00');
      return dateObj.toLocaleDateString('ru-RU', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return date;
    }
  }, [date]);

  const selectedCount = selections.size;

  // Debug logging
  console.log('StartOfDayModal render:', { isOpen, candidates, totalCounts });

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Начать день"
      size="lg"
      closeOnBackdropClick={false}
    >
      <ModalBody>
        <div className="start-of-day-modal">
          <div className="start-of-day-modal__header">
            <h3 className="start-of-day-modal__date">{formattedDate}</h3>
            <p className="start-of-day-modal__description">
              Выберите задачи для добавления в "Сегодня" или выполните другие действия.
            </p>
            {totalCounts.total > 0 && (
              <div className="start-of-day-modal__summary">
                Всего кандидатов: <strong>{totalCounts.total}</strong>
                {selectedCount > 0 && (
                  <span className="start-of-day-modal__selected">
                    {' '}• Выбрано: <strong>{selectedCount}</strong>
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="start-of-day-modal__sections">
            {totalCounts.dueToday > 0 && candidates?.dueToday && (
              <TaskCandidateSection
                title="Срок сегодня"
                tasks={candidates.dueToday}
                isExpanded={expandedSections.has('dueToday')}
                onToggle={() => handleSectionToggle('dueToday')}
                selections={selections}
                onTaskSelection={handleTaskSelection}
                onTaskDeselection={handleTaskDeselection}
                onSelectAll={() => handleSelectAllInSection('dueToday', candidates.dueToday)}
                onDeferAll={(deferDate) => handleDeferAllInSection('dueToday', candidates.dueToday, deferDate)}
              />
            )}

            {totalCounts.overdue > 0 && candidates?.overdue && (
              <TaskCandidateSection
                title="Просрочено"
                tasks={candidates.overdue}
                isExpanded={expandedSections.has('overdue')}
                onToggle={() => handleSectionToggle('overdue')}
                selections={selections}
                onTaskSelection={handleTaskSelection}
                onTaskDeselection={handleTaskDeselection}
                onSelectAll={() => handleSelectAllInSection('overdue', candidates.overdue)}
                onDeferAll={(deferDate) => handleDeferAllInSection('overdue', candidates.overdue, deferDate)}
                variant="warning"
              />
            )}

            {totalCounts.returning > 0 && candidates?.returning && (
              <TaskCandidateSection
                title="Вернувшиеся"
                tasks={candidates.returning}
                isExpanded={expandedSections.has('returning')}
                onToggle={() => handleSectionToggle('returning')}
                selections={selections}
                onTaskSelection={handleTaskSelection}
                onTaskDeselection={handleTaskDeselection}
                onSelectAll={() => handleSelectAllInSection('returning', candidates.returning)}
                onDeferAll={(deferDate) => handleDeferAllInSection('returning', candidates.returning, deferDate)}
                variant="info"
              />
            )}

            {totalCounts.missed > 0 && candidates?.missed && (
              <TaskCandidateSection
                title="Пропущено"
                tasks={candidates.missed}
                isExpanded={expandedSections.has('missed')}
                onToggle={() => handleSectionToggle('missed')}
                selections={selections}
                onTaskSelection={handleTaskSelection}
                onTaskDeselection={handleTaskDeselection}
                onSelectAll={() => handleSelectAllInSection('missed', candidates.missed)}
                onDeferAll={(deferDate) => handleDeferAllInSection('missed', candidates.missed, deferDate)}
                variant="secondary"
              />
            )}

            {totalCounts.staleInbox > 0 && candidates?.staleInbox && (
              <TaskCandidateSection
                title="Инбокс: залежалось ≥3д"
                tasks={candidates.staleInbox}
                isExpanded={expandedSections.has('staleInbox')}
                onToggle={() => handleSectionToggle('staleInbox')}
                selections={selections}
                onTaskSelection={handleTaskSelection}
                onTaskDeselection={handleTaskDeselection}
                onSelectAll={() => handleSelectAllInSection('staleInbox', candidates.staleInbox)}
                onDeferAll={(deferDate) => handleDeferAllInSection('staleInbox', candidates.staleInbox, deferDate)}
                variant="muted"
              />
            )}

            {totalCounts.total === 0 && (
              <div className="start-of-day-modal__empty">
                <p>🎉 Отлично! Нет задач, требующих внимания.</p>
                <p>Можете начать день с чистого листа.</p>
              </div>
            )}
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <div className="start-of-day-modal__footer">
          <div className="start-of-day-modal__footer-left">
            {isRestoreAvailable && onRestore && (
              <Button
                variant="secondary"
                onClick={onRestore}
                disabled={isLoading}
              >
                Вернуть как было
              </Button>
            )}
          </div>
          
          <div className="start-of-day-modal__footer-right">
            <Button
              variant="ghost"
              onClick={handleClose}
              disabled={isLoading}
            >
              Позже
            </Button>
            
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={isLoading}
            >
              {isLoading ? 'Формирование...' : 'Сформировать "Сегодня"'}
            </Button>
          </div>
        </div>
      </ModalFooter>

      <style jsx>{`
        .start-of-day-modal__header {
          margin-bottom: 24px;
        }
        
        .start-of-day-modal__date {
          font-size: 20px;
          font-weight: 600;
          margin: 0 0 8px 0;
          color: #1f2937;
        }
        
        .start-of-day-modal__description {
          color: #6b7280;
          margin: 0 0 12px 0;
          font-size: 14px;
        }
        
        .start-of-day-modal__summary {
          font-size: 14px;
          color: #374151;
        }
        
        .start-of-day-modal__selected {
          color: #059669;
        }
        
        .start-of-day-modal__sections {
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-height: 60vh;
          overflow-y: auto;
        }
        
        .start-of-day-modal__empty {
          text-align: center;
          padding: 40px 20px;
          color: #6b7280;
        }
        
        .start-of-day-modal__empty p {
          margin: 0 0 8px 0;
        }
        
        .start-of-day-modal__empty p:first-child {
          font-size: 16px;
          font-weight: 500;
          color: #059669;
        }
        
        .start-of-day-modal__footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
        }
        
        .start-of-day-modal__footer-left {
          display: flex;
          gap: 8px;
        }
        
        .start-of-day-modal__footer-right {
          display: flex;
          gap: 8px;
        }
        
        @media (max-width: 640px) {
          .start-of-day-modal__footer {
            flex-direction: column;
            gap: 12px;
          }
          
          .start-of-day-modal__footer-left,
          .start-of-day-modal__footer-right {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </Modal>
  );
};

export default StartOfDayModal;