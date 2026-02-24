import { useState, useCallback } from 'react';
import { chatService } from '../services/chatService';
import { summarizePattern } from '../utils/scheduleUtils';
import { formatValue } from '../utils/dateUtils';

/**
 * シフトに関する各種アクション（提出、承認、通知など）を管理するフック
 */
export const useShiftActions = ({
  staff, setStaff, schedule, year, month, adminConfig, shiftPatterns,
  setIsLoading, setLoadingMessage, updateShiftItems
}) => {
  const key = `${year}-${month}`;

  // 承認後の変更管理
  const [pendingChanges, setPendingChanges] = useState([]);
  const [showModificationConfirm, setShowModificationConfirm] = useState(false);

  // 通知・確認用の一時状態
  const [submissionConfirmation, setSubmissionConfirmation] = useState(null);
  const [remandConfirmation, setRemandConfirmation] = useState(null);
  const [approvalModalStaffId, setApprovalModalStaffId] = useState(null);
  const [absenceNotificationConfirmation, setAbsenceNotificationConfirmation] = useState(null);
  const [approvalCancellationConfirmation, setApprovalCancellationConfirmation] = useState(null);

  // 1. 提出処理
  const handleToggleShiftSubmitted = useCallback((staffId) => {
    const s = staff.find(x => x.id === staffId);
    if (s?.shiftSubmitted?.[key]) {
      setStaff(prev => prev.map(x => x.id === staffId ? { ...x, shiftSubmitted: { ...x.shiftSubmitted, [key]: false } } : x));
    } else {
      setSubmissionConfirmation({ staffId, name: s.name });
    }
  }, [staff, key, setStaff]);

  const handleConfirmSubmission = async () => {
    if (!submissionConfirmation) return;
    const { staffId, name } = submissionConfirmation;
    let mentions = '';
    if (adminConfig?.submissionNotificationIds) {
      mentions = adminConfig.submissionNotificationIds.split(',').map(id => id.trim()).filter(id => id !== '').map(id => `<users/${id}>`).join(' ');
    }
    setIsLoading(true);
    setLoadingMessage('提出通知を送信中...');
    try { await chatService.sendSubmission(name, year, month, mentions); } catch (e) { console.error(e); }
    setIsLoading(false);
    setStaff(prev => prev.map(x => x.id === staffId ? { ...x, shiftSubmitted: { ...x.shiftSubmitted, [key]: true } } : x));
    setSubmissionConfirmation(null);
  };

  // 2. 差戻処理
  const handleToggleShiftRemanded = useCallback((staffId) => {
    const s = staff.find(x => x.id === staffId);
    if (s?.shiftRemanded?.[key]) {
      setStaff(prev => prev.map(x => x.id === staffId ? { ...x, shiftRemanded: { ...x.shiftRemanded, [key]: false } } : x));
    } else {
      setRemandConfirmation({ staffId, name: s.name });
    }
  }, [staff, key, setStaff]);

  const handleConfirmRemand = async () => {
    if (!remandConfirmation) return;
    const { staffId, name } = remandConfirmation;
    const s = staff.find(x => x.id === staffId);
    setIsLoading(true);
    setLoadingMessage('差戻通知を送信中...');
    try { await chatService.sendRemand(name, s.chatUserId); } catch (e) { console.error(e); }
    setIsLoading(false);
    setStaff(prev => prev.map(x => x.id === staffId ? { ...x, shiftRemanded: { ...x.shiftRemanded, [key]: true } } : x));
    setRemandConfirmation(null);
  };

  // 3. 承認処理
  const handleToggleShiftApproved = useCallback((staffId) => {
    const s = staff.find(x => x.id === staffId);
    if (s?.shiftApproved?.[key]) {
      setApprovalCancellationConfirmation({ staffId, name: s.name });
    } else {
      setApprovalModalStaffId(staffId);
    }
  }, [staff, key]);

  const handleConfirmApproval = async (remarks) => {
    if (!approvalModalStaffId) return;
    const s = staff.find(x => x.id === approvalModalStaffId);
    const daysInMonth = new Date(year, month, 0).getDate();
    const irregularities = [];
    
    // イレギュラー抽出ロジック
    for (let d = 1; d <= daysInMonth; d++) {
        const val = schedule[key]?.[s.id]?.[d];
        if (typeof val === 'object' && val?.modified) {
            irregularities.push(`${month}/${d}: ${formatValue(val)}`);
        }
    }

    setIsLoading(true);
    setLoadingMessage('承認通知を送信中...');
    try {
      await chatService.sendApproval(s, year, month, summarizePattern(s.defaultShift.pattern, shiftPatterns, s.defaultShift.hasBreakArray), irregularities.join('\n') || 'なし', remarks);
    } catch (e) { console.error(e); }
    setIsLoading(false);

    // modifiedフラグクリア
    const staffSchedule = schedule[key]?.[s.id] || {};
    const updates = [];
    Object.entries(staffSchedule).forEach(([d, val]) => {
      if (typeof val === 'object' && val?.modified) {
        const { modified, ...rest } = val;
        let cleanedVal = Object.keys(rest).length === 1 && rest.type ? rest.type : rest;
        if (rest.type === '稼働' && typeof rest.hours === 'number') cleanedVal = rest.hours;
        updates.push({ staffId: s.id, day: Number(d), value: cleanedVal });
      }
    });
    if (updates.length > 0) updateShiftItems(year, month, updates);

    setStaff(prev => prev.map(x => x.id === approvalModalStaffId ? { ...x, shiftApproved: { ...x.shiftApproved, [key]: true } } : x));
    setApprovalModalStaffId(null);
  };

  const handleConfirmApprovalCancellation = () => {
    if (!approvalCancellationConfirmation) return;
    const { staffId } = approvalCancellationConfirmation;
    setStaff(prev => prev.map(x => x.id === staffId ? { ...x, shiftApproved: { ...x.shiftApproved, [key]: false } } : x));
    setApprovalCancellationConfirmation(null);
  };

  // 4. 承認後の変更確定処理
  const handleFinalizeModification = async () => {
    const targetStaffIds = [...new Set(pendingChanges.map(c => c.staffId))];
    setIsLoading(true);
    setLoadingMessage('変更を確定中...');
    
    try {
      for (const sId of targetStaffIds) {
        const staffChanges = pendingChanges.filter(c => c.staffId === sId);
        const targetStaff = staff.find(s => s.id === sId);
        if (!targetStaff) continue;

        const changeDetails = staffChanges.map(c => `${c.rawMonth}/${c.day}: ${String(c.displayValue).replace(/\(undefined\)/g, '')}`).join('\n');
        const dateSummary = staffChanges.map(c => c.day).join(', ');
        let mentions = '';
        if (adminConfig?.submissionNotificationIds) {
          mentions = adminConfig.submissionNotificationIds.split(',').map(id => id.trim()).filter(id => id !== '').map(id => `<users/${id}>`).join(' ');
        }

        await chatService.sendChangeAfterApproval(targetStaff.name, year, month, dateSummary, changeDetails, mentions);
        
        setStaff(prev => prev.map(s => s.id === sId ? { ...s, shiftApproved: { ...s.shiftApproved, [key]: false } } : s));
      }
    } catch (error) {
      alert('通知の送信に失敗しました。');
    }

    setIsLoading(false);
    setPendingChanges([]);
    setShowModificationConfirm(false);
  };

  return {
    pendingChanges, setPendingChanges,
    showModificationConfirm, setShowModificationConfirm,
    submissionConfirmation, setSubmissionConfirmation,
    remandConfirmation, setRemandConfirmation,
    approvalModalStaffId, setApprovalModalStaffId,
    absenceNotificationConfirmation, setAbsenceNotificationConfirmation,
    approvalCancellationConfirmation, setApprovalCancellationConfirmation,
    handleToggleShiftSubmitted, handleConfirmSubmission,
    handleToggleShiftRemanded, handleConfirmRemand,
    handleToggleShiftApproved, handleConfirmApproval, handleConfirmApprovalCancellation,
    handleFinalizeModification
  };
};
