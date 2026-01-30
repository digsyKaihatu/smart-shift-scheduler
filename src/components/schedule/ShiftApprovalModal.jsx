
import React, { useRef, useMemo } from 'react';
import { summarizePattern } from '../../utils/scheduleUtils';
import { formatValue } from '../../utils/dateUtils';

const ShiftApprovalModal = ({ staffMember, schedule, shiftPatterns, holidays, year, month, onConfirm, onClose }) => {
    const remarksRef = useRef(null);

    // 基本シフトパターンの要約テキスト生成
    const patternSummary = useMemo(() => {
        return summarizePattern(
            staffMember.defaultShift.pattern, 
            shiftPatterns, 
            staffMember.defaultShift.hasBreakArray // 休憩設定も渡す
        );
    }, [staffMember.defaultShift.pattern, staffMember.defaultShift.hasBreakArray, shiftPatterns]);

    // イレギュラー勤務（基本パターンと異なる日）の抽出ロジック
    const irregularPatterns = useMemo(() => {
        const irregularities = [];
        const daysInMonth = new Date(year, month, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const dayOfWeek = date.getDay(); // 0 = Sunday
            const isHoliday = holidays.includes(day);
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            let expectedValue = '';
            
            if (isWeekend || isHoliday) {
                expectedValue = 'シフト休';
            } else {
                const patternIndex = dayOfWeek - 1; // 0 = Monday
                if (patternIndex >= 0 && patternIndex < 5) {
                    const patternId = staffMember.defaultShift.pattern[patternIndex];
                    if (patternId === 'シフト休') {
                        expectedValue = 'シフト休';
                    } else if (patternId) {
                        const pattern = shiftPatterns.find(p => p.id === patternId);
                        expectedValue = pattern ? pattern.workHours : '';
                    }
                }
            }
            
            const actualValue = schedule?.[day] ?? '';

            if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
                const dayOfWeekStr = ['日', '月', '火', '水', '木', '金', '土'][dayOfWeek];
                const formattedActual = formatValue(actualValue);
                irregularities.push(`${month}/${day}(${dayOfWeekStr}): ${String(formattedActual) || '未入力'}`);
            }
        }
        return irregularities;
    }, [staffMember, schedule, shiftPatterns, holidays, year, month]);
    
    const InfoSection = ({ title, children }) => (
        <div>
            <h4 className="text-sm font-bold text-slate-700 mb-1 pb-1 border-b-2 border-[#F4B896]">{title}</h4>
            <div className="text-sm text-slate-600 mt-2">{children}</div>
        </div>
    );
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                <header className="p-4 border-b border-slate-200">
                    <h2 className="text-lg font-bold text-slate-800">{staffMember.name}さんのシフトを承認しますか？</h2>
                </header>

                <main className="p-6 overflow-y-auto space-y-6">
                    <InfoSection title="基本シフトパターン">
                        <p className="whitespace-pre-wrap">{patternSummary}</p>
                    </InfoSection>

                    <InfoSection title="イレギュラー勤務">
                        {irregularPatterns.length > 0 ? (
                            <ul className="list-disc list-inside space-y-1">
                                {irregularPatterns.map((item, index) => <li key={index}>{item}</li>)}
                            </ul>
                        ) : (
                            <p>なし</p>
                        )}
                    </InfoSection>
                    
                    <InfoSection title="備考欄">
                        <textarea
                            ref={remarksRef}
                            rows={3}
                            className="w-full p-2 border border-slate-300 rounded-md text-sm focus:ring-1 focus:ring-[#F4B896] focus:border-[#F4B896]"
                            placeholder="申し送り事項などあればご記入ください。"
                        />
                    </InfoSection>
                </main>
                
                <footer className="p-4 border-t border-slate-200 flex justify-end items-center gap-2 bg-slate-50 rounded-b-lg">
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 text-sm bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">
                            キャンセル
                        </button>
                        <button onClick={() => onConfirm(remarksRef.current?.value || '')} className="px-4 py-2 text-sm bg-[#F4B896] text-white rounded-md hover:bg-[#E8A680]">
                            はい、承認します
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default ShiftApprovalModal;
