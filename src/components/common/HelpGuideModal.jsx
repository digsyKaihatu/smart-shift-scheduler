import React from 'react';

const HelpGuideModal = ({ onClose }) => {
  // ガイド内のセクション用サブポーネント
  const GuideSection = ({ title, children }) => (
    <div className="mb-4">
      <h3 className="text-md font-bold text-[#D9824D] mb-1 border-l-4 border-[#F4B896] pl-2">{title}</h3>
      <div className="text-sm text-slate-600 space-y-2 ml-2">{children}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-lg">
          <h2 className="text-lg font-bold text-slate-800">使い方ガイド</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <main className="p-6 overflow-y-auto space-y-8">
          {/* 1. シフトの入力・編集 (画像右配置) [cite: 2, 7] */}
          <GuideSection title="1. シフトの入力・編集">
            <div className="flex items-start gap-4">
                <div className="flex-1 space-y-2">
                    <p>・シフト表の各セルをクリックすると、メニューが表示されます。</p>
                    <p>・「稼働時間入力」を選択すると、数値を直接入力できます。（例: 8, 7.5）</p>
                    <p>・「有休」「シフト休」「通休」などのステータスも選択できます。</p>
                    <p>・<span className="font-bold text-green-600">変更は自動的に保存されます。</span>手動で保存ボタンを押す必要はありません。</p>
                </div>
                <div className="w-1/3 border border-slate-200 rounded-md overflow-hidden shadow-sm flex-shrink-0">
                    <img src="/スマシフガイド1.png" alt="シフト入力の例" className="w-full h-auto object-contain bg-slate-100" />
                </div>
            </div>
          </GuideSection>
          
          {/* 2. メンバー情報の編集と通知設定 [cite: 8, 12] */}
          <GuideSection title="2. メンバー情報の編集と通知設定">
            <p>・「役職」「社員番号」「稼働名前」の各セルはクリックして直接編集できます。</p>
            <p>・<span className="font-bold text-[#D9824D]">「メンバー管理」</span>ボタンからは、上記に加え<span className="font-bold">「Chat User ID」</span>を設定できます。</p>
            <p className="text-xs text-slate-500">※Chat User IDを設定すると、Google Chatの通知でそのメンバー宛にメンションが飛びます。</p>
            <div className="mt-2 border border-slate-200 rounded-md overflow-hidden shadow-sm">
                <img src="/スマシフガイド2.png" alt="メンバー編集の例" className="w-full h-auto object-contain bg-slate-100" />
            </div>
          </GuideSection>

          {/* 3. 提出・差戻・承認と通知機能 [cite: 13, 18] */}
          <GuideSection title="3. 提出・差戻・承認と通知機能">
            <p>以下のチェックボックス操作により、Google Chatへ通知が送信されます。</p>
            <ul className="list-disc list-inside ml-2 space-y-1">
              <li><span className="font-bold text-sky-600">提出☑:</span> メンバーがチェックすると、管理者（通知設定で指定したID）へ通知が飛びます。</li>
              <li><span className="font-bold text-red-600">差戻☑ (管理者のみ):</span> 管理者がチェックすると確認画面が出ます。「はい」を押すと、対象メンバーへ<span className="font-bold text-red-600">差戻通知</span>が飛びます。</li>
              <li><span className="font-bold text-green-600">承認☑ (管理者のみ):</span> 管理者がチェックすると確認画面が出ます。「はい」を押すと、対象メンバーへ<span className="font-bold text-green-600">承認通知</span>が飛びます。</li>
            </ul>
            <div className="mt-2 border border-slate-200 rounded-md overflow-hidden shadow-sm">
                <img src="/スマシフガイド3.png" alt="通知機能の例" className="w-full h-auto object-contain bg-slate-100" />
            </div>
          </GuideSection>

          {/* 4. 基本シフトパターンの設定 [cite: 19, 22] */}
          <GuideSection title="4. 基本シフトパターンの設定">
            <p>・「基本シフト設定」のセルをクリックすると、月〜金曜のデフォルトシフトパターンを設定できます。</p>
            <p>・設定後、「基本シフトを適用」ボタンを押すと、その月のスケジュールにパターンが自動反映されます。</p>
            <div className="mt-2 border border-slate-200 rounded-md overflow-hidden shadow-sm">
                <img src="/スマシフガイド4.png" alt="基本シフト設定の例" className="w-full h-auto object-contain bg-slate-100" />
            </div>
          </GuideSection>
          
          {/* 5. シフトパターン一覧及び 各種ボタン機能 [cite: 23, 30] */}
          <GuideSection title="5. シフトパターン一覧及び 各種ボタン機能">
            <div className="space-y-3">
              <p>・シフト表の下にある「シフトパターン一覧」で、登録されている全パターンを確認できます。</p>
              <p>・「+ パターンを追加」ボタンから、新しい勤務時間パターンを自由に追加できます。</p>
              
              <hr className="border-slate-200 my-2" />
              
              <div className="space-y-2">
                <p>・<span className="font-bold text-slate-700">通知設定:</span> メンバーが提出した際に通知を受け取る管理者のChat User IDを設定します。</p>
                <p>・<span className="font-bold text-[#D9824D]">業務担当を設定:</span> 誰がどの業務を担当できるかを一括で設定します。</p>
                <p>・<span className="font-bold text-[#D9824D]">+ メンバー/業務を追加:</span> 新しい行を追加します。</p>
                <p>・<span className="font-bold text-gray-600">CSVエクスポート:</span> 表示されているシフト表（差戻状況含む）をCSVファイルとしてダウンロードします。</p>
              </div>
            </div>
            <div className="mt-2 border border-slate-200 rounded-md overflow-hidden shadow-sm">
                <img src="/スマシフガイド用8.png" alt="シフトパターンと各種ボタンの例" className="w-full h-auto object-contain bg-slate-100" />
            </div>
          </GuideSection>

         {/* 6. 業務と人員不足の確認 [cite: 31, 34] */}
          <GuideSection title="6. 業務と人員不足の確認">
            <p>・ページ下部の「業務一覧」で、日ごとの各業務の稼働人数を確認できます。</p>
            <p>・必要な人員に対して稼働人数が足りていない日は「不足」とハイライト表示されます。</p>
            <div className="mt-2 border border-slate-200 rounded-md overflow-hidden shadow-sm">
                <img src="/スマシフガイド6.png" alt="業務一覧の例" className="w-full h-auto object-contain bg-slate-100" />
            </div>
          </GuideSection>

        </main>
        
        <footer className="p-4 border-t border-slate-200 flex justify-end bg-slate-50 rounded-b-lg">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-[#F4B896] text-white rounded-md hover:bg-[#E8A680] transition-colors shadow-sm">
            閉じる
          </button>
        </footer>
      </div>
    </div>
  );
};

export default HelpGuideModal;
