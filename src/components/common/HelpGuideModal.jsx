import React from 'react';

const HelpGuideModal = ({ onClose }) => {
  // ガイド内のセクション用サブポーネント
  const GuideSection = ({ title, children }) => (
    <div className="mb-6">
      <h3 className="text-lg font-bold text-[#D9824D] mb-2 border-l-4 border-[#F4B896] pl-3 py-0.5">{title}</h3>
      <div className="text-sm text-slate-600 space-y-3 ml-1">{children}</div>
    </div>
  );

  // キーボードショートカットのテーブル行
  const ShortcutRow = ({ keys, action }) => (
      <tr className="border-b border-slate-100 last:border-0">
          <td className="py-2 pr-4 font-mono font-bold text-slate-700">{keys}</td>
          <td className="py-2 text-slate-600">{action}</td>
      </tr>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-xl">
          <div>
            <h2 className="text-xl font-bold text-slate-800">使い方ガイド</h2>
            <p className="text-xs text-slate-500 mt-1">効率的なシフト管理のための操作マニュアル</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <main className="p-6 overflow-y-auto">
          
          {/* 1. シフト入力の基本 */}
          <GuideSection title="1. シフトの入力・編集">
            <div className="grid md:grid-cols-2 gap-6">
                <div>
                    <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                        <span className="bg-slate-100 p-1 rounded text-lg">🖱️</span> マウス操作
                    </h4>
                    <p className="mb-2">セルをクリックするとメニューが表示されます。</p>
                    <ul className="list-disc list-inside space-y-1 text-xs text-slate-600 ml-1">
                        <li><span className="font-bold">稼働時間入力:</span> 数値を入力 (例: 8, 7.5)</li>
                        <li><span className="font-bold">ステータス選択:</span> 有休、シフト休などを選択</li>
                    </ul>
                    <div className="mt-3 p-3 bg-green-50 rounded border border-green-100 text-xs text-green-800">
                        <span className="font-bold">✅ 自動保存:</span><br/>
                        変更は即座に保存されます。<br/>保存ボタンを押す必要はありません。
                    </div>
                </div>
                
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                        <span className="bg-white p-1 rounded text-lg shadow-sm">⌨️</span> キーボード操作
                    </h4>
                    <p className="text-xs mb-3">Excelのようにキーボードだけで高速に入力できます。</p>
                    <table className="w-full text-xs">
                        <tbody>
                            <ShortcutRow keys="矢印キー" action="セルの移動" />
                            <ShortcutRow keys="数字 (0-9)" action="直接入力モード開始" />
                            <ShortcutRow keys="Enter" action="編集開始 / 確定して下へ移動" />
                            <ShortcutRow keys="Delete / BS" action="内容をクリア" />
                            <ShortcutRow keys="Esc" action="編集キャンセル" />
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="mt-4 bg-orange-50 p-4 rounded-lg border border-orange-100">
                <h4 className="font-bold text-orange-900 mb-2 flex items-center gap-2">
                    <span className="bg-white p-1 rounded text-lg shadow-sm">✨</span> 便利機能：範囲選択と一括操作
                </h4>
                <div className="flex flex-col sm:flex-row gap-4 text-sm text-orange-800">
                    <div className="flex-1">
                        <span className="font-bold bg-orange-200 px-2 py-0.5 rounded text-orange-900 text-xs mr-2">Step 1</span>
                        セルを<span className="font-bold">ドラッグ</span>して範囲を選択
                    </div>
                    <div className="hidden sm:block">→</div>
                    <div className="flex-1">
                        <span className="font-bold bg-orange-200 px-2 py-0.5 rounded text-orange-900 text-xs mr-2">Step 2</span>
                        選択範囲の上で<span className="font-bold">右クリック</span>
                    </div>
                    <div className="hidden sm:block">→</div>
                    <div className="flex-1">
                        <span className="font-bold bg-orange-200 px-2 py-0.5 rounded text-orange-900 text-xs mr-2">Step 3</span>
                        メニューから「シフト休」などを一括適用
                    </div>
                </div>
            </div>
          </GuideSection>
          
          <hr className="my-6 border-slate-100" />

          {/* 2. 画面の見方 */}
          <GuideSection title="2. 画面の見方">
             <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                    <h4 className="font-bold text-slate-700 mb-2">背景色の意味 (日付・セル)</h4>
                    <ul className="space-y-2 text-xs">
                        <li className="flex items-center gap-2"><span className="w-4 h-4 bg-sky-100 border border-sky-200 rounded"></span> 土曜日 (薄い青)</li>
                        <li className="flex items-center gap-2"><span className="w-4 h-4 bg-pink-100 border border-pink-200 rounded"></span> 日曜・祝日 (薄い赤)</li>
                        <li className="flex items-center gap-2"><span className="w-4 h-4 bg-yellow-100 border border-yellow-300 rounded"></span> 今日 (薄い黄色)</li>
                    </ul>
                </div>
                <div className="flex-1">
                    <h4 className="font-bold text-slate-700 mb-2">ステータスの色</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-2"><span className="w-3 h-3 bg-green-200 rounded"></span> 稼働 (数値)</div>
                        <div className="flex items-center gap-2"><span className="w-3 h-3 bg-slate-200 rounded"></span> シフト休</div>
                        <div className="flex items-center gap-2"><span className="w-3 h-3 bg-yellow-200 rounded"></span> 有休</div>
                        <div className="flex items-center gap-2"><span className="w-3 h-3 bg-red-200 rounded"></span> 欠勤</div>
                    </div>
                </div>
             </div>
          </GuideSection>

          <hr className="my-6 border-slate-100" />

          {/* 3. 管理者向け機能 */}
          <GuideSection title="3. 管理者向け機能">
             <div className="space-y-4">
                <div>
                    <h4 className="font-bold text-slate-700 mb-1">通知機能 (Google Chat連携)</h4>
                    <p className="text-xs mb-2">チェックボックスを操作すると、連携済みのChatへ通知が飛びます。</p>
                    <div className="flex gap-4 text-xs">
                        <div className="flex items-center gap-1"><span className="text-sky-600 font-bold">提出☑</span> → 管理者へ通知</div>
                        <div className="flex items-center gap-1"><span className="text-red-600 font-bold">差戻☑</span> → メンバーへ通知</div>
                        <div className="flex items-center gap-1"><span className="text-green-600 font-bold">承認☑</span> → メンバーへ承認通知</div>
                    </div>
                </div>
                
                <div>
                    <h4 className="font-bold text-slate-700 mb-1">基本シフトパターン</h4>
                    <p className="text-xs">
                        各メンバーの「基本シフト設定」列をクリックしてパターンを設定し、「適用」ボタンを押すと、
                        その月の平日に一括反映されます。<br/>
                        <span className="text-slate-400">(土日祝は自動的にシフト休になります)</span>
                    </p>
                </div>
             </div>
          </GuideSection>

        </main>
        
        <footer className="p-4 border-t border-slate-200 flex justify-end bg-slate-50 rounded-b-xl">
          <button onClick={onClose} className="px-6 py-2.5 text-sm font-bold bg-[#F4B896] text-white rounded-lg hover:bg-[#E8A680] transition-colors shadow-sm active:transform active:scale-95">
            閉じる
          </button>
        </footer>
      </div>
    </div>
  );
};

export default HelpGuideModal;
