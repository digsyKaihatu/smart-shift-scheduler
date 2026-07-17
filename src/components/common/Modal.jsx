import React from 'react';

export const Modal = ({ children, onClose }) => {
  return (
    // ★修正: 背景クリックで onClose が発火するように追加
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      {/* ★修正: モーダルの中身をクリックした時は、背景クリック扱いにならないようイベントを止める */}
      <div 
        className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto relative animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

export const ConfirmationModal = ({ title, message, onConfirm, onCancel, confirmText = "はい", cancelText = "いいえ", confirmColor = "bg-blue-600 hover:bg-blue-700" }) => {
  return (
    // ※こちらは誤操作防止のため、あえて背景クリックでは閉じない仕様のままにしています
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 animate-scaleIn">
        <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-600 mb-6 whitespace-pre-wrap">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md transition-colors shadow-sm ${confirmColor}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export const ConfirmDeleteModal = ({ itemType, itemName, onConfirm, onCancel }) => {
    return (
      <ConfirmationModal
        title={`${itemType}の削除`}
        message={`本当に「${itemName}」を削除しますか？\nこの操作は取り消せません。`}
        onConfirm={onConfirm}
        onCancel={onCancel}
        confirmText="削除する"
        cancelText="キャンセル"
        confirmColor="bg-red-600 hover:bg-red-700"
      />
    );
};
