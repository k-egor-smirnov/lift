import React from 'react';
import { Check, Zap, Target, Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DailyStatistics, WeeklyStatistics, MonthlyStatistics } from '../../application/services/StatisticsService';
import { StatsPeriod } from '../view-models/StatsViewModel';

interface StatsCardsProps {
  stats: DailyStatistics | WeeklyStatistics | MonthlyStatistics;
  period: StatsPeriod;
}

interface StatCard {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  description: string;
}

export const StatsCards: React.FC<StatsCardsProps> = ({ stats, period }) => {
  const { t } = useTranslation();
  
  const getCards = (): StatCard[] => {
    const totalCompleted = stats.simpleCompleted + stats.focusCompleted;
    
    return [
      {
        title: t('stats.totalCompleted'),
        value: totalCompleted,
        icon: Check,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        description: t('stats.totalCompletedDesc', { period: t(`periods.${period}`) })
      },
      {
        title: t('stats.simpleTasks'),
        value: stats.simpleCompleted,
        icon: Zap,
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        description: t('stats.simpleTasksDesc', { period: t(`periods.${period}`) })
      },
      {
        title: t('stats.focusTasks'),
        value: stats.focusCompleted,
        icon: Target,
        color: 'text-purple-600',
        bgColor: 'bg-purple-50',
        description: t('stats.focusTasksDesc', { period: t(`periods.${period}`) })
      },
      {
        title: t('stats.inboxReviewed'),
        value: stats.inboxReviewed,
        icon: Inbox,
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
        description: t('stats.inboxReviewedDesc', { period: t(`periods.${period}`) })
      }
    ];
  };

  const cards = getCards();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card, index) => (
        <div
          key={index}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between mb-4">
            <div className={`p-3 rounded-lg ${card.bgColor}`}>
              <card.icon className="w-6 h-6 text-gray-600" />
            </div>
            <div className="text-right">
              <div className={`text-3xl font-bold ${card.color}`}>
                {card.value}
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {card.title}
            </h3>
            <p className="text-sm text-gray-600">
              {card.description}
            </p>
          </div>

          {/* Progress indicator for visual appeal */}
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  card.color.includes('green') ? 'bg-green-500' :
                  card.color.includes('blue') ? 'bg-blue-500' :
                  card.color.includes('purple') ? 'bg-purple-500' :
                  'bg-orange-500'
                }`}
                style={{
                  width: `${Math.min(100, (card.value / Math.max(1, Math.max(...cards.map(c => c.value)))) * 100)}%`
                }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};