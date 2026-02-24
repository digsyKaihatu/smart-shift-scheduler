import React from 'react';
import MemberManagementModal from '../admin/MemberManagementModal';
import AdminSettingsModal from '../admin/AdminSettingsModal';
import TaskStaffMappingEditor from '../tasks/TaskStaffMappingEditor';
import HelpGuideModal from '../common/HelpGuideModal';
import { ConfirmationModal, ConfirmDeleteModal } from '../common/Modal';
import ShiftApprovalModal from '../schedule/ShiftApprovalModal';

const GlobalModals = ({
  flags,
  data,
  actions
}) => {
  const {
    isMemberManagementOpen, isAdminSettingsOpen, isTaskEditorOpen, isHelpOpen,
    confirmDelete, approvalStaff, submissionConfirmation, remandConfirmation,
    holidayConfirmation, absenceNotificationConfirmation, approvalCancellationConfirmation,
    showModificationConfirm
  } = flags;

  const { staff, tasks, adminConfig, shiftPatterns, year, month, holidays, currentMonthSchedule } = data;
  const {
    setIsMemberManagementOpen, setIsAdminSettingsOpen, setIsTaskEditorOpen, setIsHelpOpen,
    handleSaveMemberManagement, handleSaveAdminConfig, handleMigrateData, handleBulkUpdateStaffTasks,
    executeDelete, setConfirmDelete, handleConfirmApproval, setApprovalModalStaffId,
    handleConfirmSubmission, setSubmissionConfirmation, handleConfirmRemand, setRemandConfirmation,
    handleConfirmHoliday, setHolidayConfirmation, handleAbsenceNotificationResponse,
    handleConfirmApprovalCancellation, setApprovalCancellationConfirmation,
    handleFinalizeModification, setShowModificationConfirm
  } = actions;

  return (
    <>
      {isMemberManagementOpen && (
        <MemberManagementModal staff={staff} onClose={() => setIsMemberManagementOpen(false)} onSave={handleSaveMemberManagement} />
      )}
      {isAdminSettingsOpen && (
        <AdminSettingsModal 
          adminConfig={adminConfig} 
          onClose={() => setIsAdminSettingsOpen(false)} 
          onSave={handleSaveAdminConfig} 
          onMigrate={handleMigrateData} 
        />
      )}
      {isTaskEditorOpen && (
        <TaskStaffMappingEditor staff={staff} tasks={tasks} onClose={() => setIsTaskEditorOpen(false)} onSave={handleBulkUpdateStaffTasks} />
      )}
      {isHelpOpen && <HelpGuideModal onClose={() => setIsHelpOpen(false)} />}
      
      {confirmDelete && (
        <ConfirmDeleteModal 
          itemType={confirmDelete.type === 'staff' ? 'メンバー' : '業務'} 
          itemName={confirmDelete.name} 
          onConfirm={executeDelete} 
          onCancel={() => setConfirmDelete(null)} 
        />
      )}
      
      {approvalStaff && (
        <ShiftApprovalModal 
          staffMember={approvalStaff} 
          schedule={currentMonthSchedule[approvalStaff.id]} 
          shiftPatterns={shiftPatterns} 
          holidays={holidays} 
          year={year} 
          month={month} 
          onConfirm={handleConfirmApproval} 
          onClose={() => setApprovalModalStaffId(null)} 
        />
      )}

      {submissionConfirmation && (
        <ConfirmationModal 
          title="シフトの提出" message="提出しますか？" 
          onConfirm={handleConfirmSubmission} onCancel={() => setSubmissionConfirmation(null)} 
        />
      )}
      
      {remandConfirmation && (
        <ConfirmationModal 
          title="差戻の確認" message="本当に差し戻しますか？" 
          onConfirm={handleConfirmRemand} onCancel={() => setRemandConfirmation(null)} 
        />
      )}

      {holidayConfirmation && (
        <ConfirmationModal 
          title={holidayConfirmation.isUnlocking ? "休日設定解除" : "休日設定"} 
          message="全メンバーに適用しますか？" 
          onConfirm={handleConfirmHoliday} onCancel={() => setHolidayConfirmation(null)} 
        />
      )}

      {absenceNotificationConfirmation && (
        <ConfirmationModal 
          title="欠勤の周知" 
          message={`${absenceNotificationConfirmation.staffMember.name}さんの欠勤をチャットで周知しますか？`} 
          onConfirm={() => handleAbsenceNotificationResponse(true)} onCancel={() => handleAbsenceNotificationResponse(false)} 
        />
      )}

      {approvalCancellationConfirmation && (
        <ConfirmationModal 
          title="承認の取り消し" message={`${approvalCancellationConfirmation.name}さんの承認を取り消しますか？`} 
          onConfirm={handleConfirmApprovalCancellation} onCancel={() => setApprovalCancellationConfirmation(null)} 
        />
      )}

      {showModificationConfirm && (
        <ConfirmationModal 
          title="承認済みシフトの変更" 
          message="承認済みのシフトが変更されました。\n続けて他の箇所も修正しますか？それとも変更を確定して通知を送りますか？" 
          confirmText="修正を確定"
          cancelText="続けて修正"
          confirmColor="bg-orange-500 hover:bg-orange-600"
          onConfirm={handleFinalizeModification} 
          onCancel={() => setShowModificationConfirm(false)} 
        />
      )}
    </>
  );
};

export default GlobalModals;
