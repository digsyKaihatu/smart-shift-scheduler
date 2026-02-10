import React from 'react';
import { createPortal } from 'react-dom';

// 閉じるボタン（X）アイコン
const XIcon = ({ size = 24 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

// ゴミ箱アイコン（削除機能用）
const TrashIcon = ({ size = 20, className = "" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    <line x1="10" y1="11" x2="10" y2="17"></line>
    <line x1="14" y1="11" x2="14" y2="17"></line>
  </svg>
);

// 色生成ロジック (MonthlyCalendarと共通化すべきですが、依存回避のため内包)
const getColorForName = (name) => {
  const colors = [
    { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
    { bg: '#ffedd5', border: '#f97316', text: '#9a3412' },
    { bg: '#fef9c3', border: '#eab308', text: '#854d0e' },
    { bg: '#dcfce7', border: '#22c55e', text: '#166534' },
    { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
    { bg: '#e0e7ff', border: '#6366f1', text: '#3730a3' },
    { bg: '#f3e8ff', border: '#a855f7', text: '#6b21a8' },
    { bg: '#fce7f3', border: '#ec4899', text: '#9d174d' },
  ];
  if (!name) return colors[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const getDayOfWeekStr = (date) => {
  return ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
};

const DailyShiftDetailModal = ({ detail, viewMode, onClose, onDelete, canDelete }) => {
  if (!detail) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <span className="text-2xl text-[#D9824D]">{detail.date.getDate()}</span>
                    <span className="text-sm text-slate-500">{getDayOfWeekStr(detail.date)}曜日</span>
                    <span className={`px-3 py-1 text-white text-xs font-bold rounded-full ml-4 ${viewMode === 'active_shifts' ? 'bg-[#F4B896]' : 'bg-slate-400'}`}>
                        {viewMode === 'active_shifts' ? '出勤者一覧' : '休暇者一覧'}
                    </span>
                </h3>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors">
                    <XIcon size={24} />
                </button>
            </div>
            
            <div className="p-6 overflow-y-auto bg-slate-50/50 flex-grow">
                {detail.events.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {detail.events.map(ev => {
                            const colors = getColorForName(ev.userName);
                            const isDeletable = canDelete ? canDelete(ev) : false;
                            return (
                                <div 
                                    key={ev.id} 
                                    className="relative flex items-center justify-between bg-white px-4 py-3 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow" 
                                    style={{ borderLeft: `4px solid ${colors.border}` }}
                                >
                                    <div className="flex flex-col overflow-hidden">
                                        <span className="text-sm text-slate-700 font-bold truncate">{ev.userName}</span>
                                        <span className="text-xs text-slate-500">{ev.type}</span>
                                    </div>
                                    {isDeletable && (
                                        <button onClick={(e) => onDelete(e, ev)} className="text-slate-300 hover:text-red-500 transition-colors ml-2">
                                            <TrashIcon size={14} />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-10 text-slate-400">
                        該当するメンバーはいません。
                    </div>
                )}
            </div>
        </div>
    </div>,
    document.body
  );
};

export default DailyShiftDetailModal;
