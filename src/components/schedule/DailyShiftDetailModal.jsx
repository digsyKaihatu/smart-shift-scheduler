import React from 'react';
import { getDayOfWeekStr } from '../../utils/dateUtils';
import { getColorForName } from '../../utils/styleUtils';
import { XIcon, TrashIcon } from '../common/Icons';

const DailyShiftDetailModal = ({ detail, viewMode, onClose, onDelete, canDelete }) => {
  if (!detail) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b flex justify-between items-center bg-slate-50">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <span className="text-2xl text-[#D9824D]">{detail.date.getDate()}</span>
                    <span className="text-sm text-slate-500">{getDayOfWeekStr(detail.date)}曜日</span>
                    <span className="px-3 py-1 bg-[#F4B896] text-white text-xs font-bold rounded-full ml-4">
                        メンバー
                    </span>
                </h3>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors"><XIcon size={24} /></button>
            </div>
            
            <div className="p-6 overflow-y-auto bg-slate-50/50 flex-grow">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {detail.events.map(ev => {
                        const colors = getColorForName(ev.userName);
                        const isDeletable = canDelete(ev);
                        return (
                            <div key={ev.id} className="relative flex items-center justify-between bg-white px-4 py-3 rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow" style={{ borderLeft: `4px solid ${colors.border}` }}>
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
            </div>
        </div>
    </div>
  );
};

export default DailyShiftDetailModal;
