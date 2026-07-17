import React from 'react';

// ★修正: サブコンポーネントをメインコンポーネントの「外」に移動しました
const GuideSection = ({ title, children }) => (
  <div className="mb-8">
    <h3 className="text-xl font-bold text-[#D9824D] mb-3 border-l-4 border-[#F4B896] pl-3">{title}</h3>
    <div className="text-base text-slate-600 space-y-3 ml-1">{children}</div>
  </div>
);

// ★修正: 管理者バッジも外に移動しました
const AdminBadge = () => (
  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-slate-600 text-white align-middle">
    管理者のみ
  </span>
);

const HelpGuideModal = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-lg">
          <h2 className="text-xl font-bold text-slate-800">使い方ガイド</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <main className="p-8 overflow-y-auto space-y-10 custom-scrollbar">
          
          <GuideSection title="1. シフトの入力・編集">
            <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 space-y-4">
                    <ul className="list-disc list-inside space-y-2">
                        <li><span className="font-bold">シフト表の各セルをクリック（またはF2キー）</span>すると、入力メニューが表示されます。</li>
                        <li><span className="font-bold">数字キー</span>を押すか、「稼働時間入力」を選択すると、数値を直接入力できます。（例: <code className="bg-slate-100 px-1 rounded">8</code>, <code className="bg-slate-100 px-1 rounded">7.5</code>）</li>
                        <li>「有休」「シフト休」「通院休暇」などのステータスや、「遅刻」「早退」などの時間付きステータスも選択できます。</li>
                        <li><span className="font-bold">右クリック</span>するとコンテキストメニューが表示され、「シフト休」「有休」「クリア」を一括で適用できます（ドラッグでの範囲選択時にも有効）。</li>
                        <li>変更は<span className="font-bold text-green-600">自動的に保存</span>されます（画面右上に「自動保存済み」等のステータスが表示されます）。手動で保存ボタンを押す必要はありません。</li>
                    </ul>
                    
                    <div className="mt-4 pt-4 border-t border-slate-100 bg-slate-50 p-4 rounded-md">
                        <p className="font-bold text-slate-700 mb-3 text-lg">⌨️ Excelのようなキーボード操作</p>
                        <ul className="list-disc list-inside text-sm text-slate-600 ml-1 space-y-2">
                            <li><span className="font-bold">矢印キー:</span> 上下左右にセルを移動</li>
                            <li><span className="font-bold">Enter:</span> 編集開始（メニューを開く） / 確定して下へ移動</li>
                            <li><span className="font-bold">F2:</span> 編集開始（メニューを開く）</li>
                            <li><span className="font-bold">Tab / Shift+Tab:</span> 右 / 左へ移動</li>
                            <li><span className="font-bold">Delete / Backspace:</span> 内容を削除（クリア）</li>
                            <li><span className="font-bold">数字キー:</span> 直接数値入力開始 (例:「8」を押すと即座に入力モードへ)</li>
                        </ul>
                    </div>
                </div>
                <div className="w-full md:w-1/3 border border-slate-200 rounded-md overflow-hidden shadow-sm flex-shrink-0 bg-white">
                    <img src="/スマシフガイド1.png" alt="シフト入力の例" className="w-full h-auto object-contain" />
                </div>
            </div>
          </GuideSection>
          
          <GuideSection title="2. メンバー情報の編集と担当業務の確認">
            <div className="space-y-3">
                <ul className="list-disc list-inside space-y-2">
                    <li>シフト表左側の「役職」「社員番号」「稼働名前」の各セルは、クリックして直接テキストを編集できます。</li>
                    <li><span className="font-bold">「稼働名前・業務一覧」</span>のセルにある<span className="font-bold text-[#D9824D]">リストアイコン(📋)</span>をクリックすると、そのメンバーが担当可能な業務の一覧を確認できます。</li>
                    <li><span className="font-bold text-[#D9824D]">「メンバー管理」</span>ボタン<AdminBadge />からは、上記に加え「メールアドレス」や<span className="font-bold">「Chat User ID」</span>を設定できます。</li>
                </ul>
                <p className="text-sm text-slate-500 ml-5">※Chat User IDを設定すると、Google Chatの通知でそのメンバー宛にメンション（通知）が飛びます。</p>
            </div>
            <div className="mt-4 border border-slate-200 rounded-md overflow-hidden shadow-sm max-w-3xl">
                <img src="/スマシフガイド2.png" alt="メンバー編集の例" className="w-full h-auto object-contain bg-slate-100" />
            </div>
          </GuideSection>

          <GuideSection title="3. シフト提出・承認のフローと通知">
            <div className="space-y-6">
                <div>
                    <h4 className="font-bold text-slate-700 mb-2 text-lg">STEP 1: シフトの提出 (メンバー)</h4>
                    <ul className="list-disc list-inside ml-2 space-y-2 text-slate-600">
                        <li>全てのシフト入力が完了したら、自分の行の<span className="font-bold text-sky-600">「提出☑」</span>をチェックします。</li>
                        <li>確認画面で「はい」を押すと、<span className="font-bold">管理者</span>へ提出通知が送信されます。</li>
                    </ul>
                </div>

                <div>
                    <h4 className="font-bold text-slate-700 mb-2 text-lg flex items-center">
                        STEP 2: 確認・承認 <AdminBadge />
                    </h4>
                    <p className="text-sm text-slate-500 ml-2 mb-2">管理者はメンバーのシフトを確認し、以下のいずれかを行います。</p>
                    <ul className="list-disc list-inside ml-2 space-y-2 text-slate-600">
                         <li>
                            <span className="font-bold text-green-600">承認☑:</span> 問題なければチェックします。メンバーへ<span className="font-bold">承認通知（確定シフト詳細）</span>が送信されます。
                            <p className="text-sm text-slate-500 mt-2 ml-1 pl-3 border-l-4 border-slate-300">
                                ※通知内の「特記事項」は、設定された<span className="font-bold">基本シフトパターン</span>を基準とし、それと異なる勤務内容（時間変更や欠勤など）が自動的に抽出・記載されます。
                            </p>
                         </li>
                         <li><span className="font-bold text-red-600">差戻☑:</span> 修正が必要な場合チェックします。メンバーへ<span className="font-bold">差戻通知</span>が送信されます。</li>
                    </ul>
                </div>

                <div>
                    <h4 className="font-bold text-slate-700 mb-2 text-lg flex items-center">
                        その他: 承認後シフトの変更 <AdminBadge />
                    </h4>
                    <p className="text-slate-600 ml-2">管理者が<span className="font-bold text-orange-600">承認済みのシフト</span>を変更すると、画面上部にオレンジ色の通知バーが表示されます。まとめて修正した後、「変更を確定して通知」ボタンを押すと、該当メンバーに変更内容がチャットで通知され、承認ステータスが解除されます。</p>
                </div>
            </div>
            <div className="mt-4 border border-slate-200 rounded-md overflow-hidden shadow-sm max-w-3xl">
                <img src="/スマシフガイド3.png" alt="通知機能の例" className="w-full h-auto object-contain bg-slate-100" />
            </div>
          </GuideSection>

          <GuideSection title="4. 基本シフトパターンの設定">
            <ul className="list-disc list-inside space-y-2">
                <li>メンバー行の「基本シフト設定」セルをクリックすると、設定画面（ポップアップ）が開きます。</li>
                <li>月〜金曜のデフォルトシフトパターンを個別に、または一括で設定できます（休憩の有無も設定可能）。</li>
                <li>設定後、ポップアップ内の<span className="font-bold text-[#D9824D]">「適用」</span>ボタンを押すと、その月のスケジュール（平日のみ）にパターンが自動反映されます。</li>
            </ul>
            <div className="mt-4 border border-slate-200 rounded-md overflow-hidden shadow-sm max-w-2xl">
                <img src="/スマシフガイド4.png" alt="基本シフト設定の例" className="w-full h-auto object-contain bg-slate-100" />
            </div>
          </GuideSection>
          
          <GuideSection title="5. シフトパターン一覧及び 各種ボタン機能">
            <p className="mb-3">シフト表の下部にあるエリアで、マスタデータの管理や各種操作を行います。</p>
            <ul className="list-disc list-inside ml-2 space-y-2">
                <li><span className="font-bold">シフトパターン一覧:</span> 登録されている勤務時間パターン（A, B...）を確認できます。クリックで開閉します。</li>
                <li><span className="font-bold bg-[#F4B896] text-white px-2 py-0.5 rounded text-sm">+ パターンを追加:</span> 新しい勤務時間パターン（記号、時間、休憩）を作成します。</li>
                <li><span className="font-bold text-slate-700">通知設定:</span><AdminBadge /> メンバーが「提出」した際に通知を受け取る管理者のChat User IDを設定します（カンマ区切りで複数指定可）。</li>
                <li><span className="font-bold text-[#D9824D]">業務担当:</span><AdminBadge /> 各業務について、担当可能なメンバーの割り当てを一括で設定します。</li>
                <li><span className="font-bold text-[#D9824D]">+ メンバー:</span><AdminBadge /> 新しいメンバー行を追加します。</li>
                <li><span className="font-bold text-[#D9824D]">+ 業務:</span><AdminBadge /> 新しい業務列を追加します。</li>
                <li><span className="font-bold text-gray-600 bg-gray-200 px-2 py-0.5 rounded text-sm">CSV:</span> 現在表示されているシフト表（手入力値と基本パターンのマージ結果）をCSVファイルとしてダウンロードします。</li>
            </ul>
            <div className="mt-4 border border-slate-200 rounded-md overflow-hidden shadow-sm">
                <img src="/スマシフガイド用8.png" alt="シフトパターンと各種ボタンの例" className="w-full h-auto object-contain bg-slate-100" />
            </div>
          </GuideSection>

          <GuideSection title="6. 業務と人員不足の確認">
            <ul className="list-disc list-inside space-y-2">
                <li>ページ下部の「業務一覧」で、日ごとの各業務の稼働人数を確認できます。</li>
                <li>設定された「定員」に対して稼働人数が足りていない日は、<span className="font-bold text-red-500">「不足」</span>とハイライト表示されます（不足割合に応じて赤〜黄色で警告）。</li>
                <li>人数の書かれたセルをクリックすると、その日のその業務を担当する<span className="font-bold">出勤者リスト</span>が表示されます。</li>
                <li className="flex items-start">
                    <span className="mr-1">管理者のみ、業務名や定員数を直接クリックして修正・削除できます。</span>
                    <AdminBadge />
                </li>
            </ul>
            <div className="mt-4 border border-slate-200 rounded-md overflow-hidden shadow-sm max-w-3xl">
                <img src="/スマシフガイド6.png" alt="業務一覧の例" className="w-full h-auto object-contain bg-slate-100" />
            </div>
          </GuideSection>

          <GuideSection title="7. 月間カレンダーの確認">
            <ul className="list-disc list-inside space-y-2">
                <li>ページ最下部のカレンダーで、日ごとの<span className="font-bold">「出勤」</span>または<span className="font-bold">「休み」</span>のメンバー一覧を確認できます。</li>
                <li>カレンダー上部のボタンで、「出勤」と「休み」の表示を切り替えることができます。</li>
                <li>日付のセルをクリックすると、その日の該当する<span className="font-bold">メンバーの詳細な一覧</span>がポップアップで表示されます。</li>
            </ul>
          </GuideSection>

        </main>
        
        <footer className="p-5 border-t border-slate-200 flex justify-end bg-slate-50 rounded-b-lg">
          <button onClick={onClose} className="px-6 py-2.5 text-base bg-[#F4B896] text-white rounded-md hover:bg-[#E8A680] transition-colors shadow-sm font-bold">
            閉じる
          </button>
        </footer>
      </div>
    </div>
  );
};

export default HelpGuideModal;
