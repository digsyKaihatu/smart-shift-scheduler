import React, { useState } from 'react';

const AdminSettingsModal = ({ adminConfig, onClose, onSave, onMigrate }) => {
  const [submissionNotificationIds, setSubmissionNotificationIds] = useState(adminConfig.submissionNotificationIds || "");

  const handleSave = () => {
    onSave({
      ...adminConfig,
      submissionNotificationIds
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg flex flex-col">
        <header className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">管理者設定</h2>
          <p className="text-sm text-slate-500">通知などの全体設定を行います。</p>
        </header>

        <main className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">提出通知を送るUser ID（カンマ区切りで複数可）</label>
            <textarea
              value={submissionNotificationIds}
              onChange={(e) => setSubmissionNotificationIds(e.target.value)}
              className="w-full h-32 p-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:border-[#F4B896] focus:ring-1 focus:ring-[#F4B896]"
              placeholder="例: 103447..., 104076..."
            />
            <p className="text-xs text-slate-500 mt-1">
              ここにIDを設定すると、メンバーがシフトを提出した際に、指定されたユーザーへメンション通知が飛びます。
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-sm font-bold text-slate-700 mb-2">データ管理</h3>
            <div className="bg-yellow-50 border border-yellow-100 p-3 rounded-md">
              <p className="text-xs text-yellow-800 mb-2">
                古いシフトパターン（A）を使用しているデータを、新しい形式（I: 9:30-18:30）へ一括変換します。
                <br />※必要な場合のみ実行してください。
              </p>
              <button 
                onClick={onMigrate}
                className="px-3 py-1.5 bg-white border border-yellow-300 text-yellow-800 text-xs font-bold rounded hover:bg-yellow-100 transition-colors shadow-sm"
              >
                データ移行を実行（パターンA → I）
              </button>
            </div>
          </div>
        </main>
        
        <footer className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50 rounded-b-lg">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300">
            キャンセル
          </button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-[#F4B896] text-white rounded-md hover:bg-[#E8A680]">
            保存して閉じる
          </button>
        </footer>
      </div>
    </div>
  );
};

export default AdminSettingsModal;
