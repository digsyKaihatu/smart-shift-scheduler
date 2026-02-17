// Google Chatへの通知を行う共通関数
const sendToChat = async (webhookUrl, payload) => {
  if (!webhookUrl) return;
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Chat通知エラー: ${errorData?.error?.message || response.statusText}`);
    }
  } catch (error) {
    console.error('Notification Failed:', error);
    throw error; // エラーを呼び出し元に伝播させる
  }
};

export const chatService = {
  // 提出通知
  sendSubmission: async (name, year, month, mentions = '') => {
    const url = import.meta.env.VITE_CHAT_WEBHOOK_SUBMISSION;
    const message = `${mentions} ${name}さんが${year}年${month}月のシフトを提出しました！`;
    await sendToChat(url, { text: message });
  },

  // 差戻通知
  sendRemand: async (name, chatUserId) => {
    const url = import.meta.env.VITE_CHAT_WEBHOOK_REMAND;
    const prefix = chatUserId ? `<users/${chatUserId}>` : `【To: ${name}さん】`;
    const message = `${prefix} シフトが差し戻しされました。管理者とご相談願います。`;
    await sendToChat(url, { text: message });
  },

  // 欠勤通知
  sendAbsence: async (name) => {
    const url = import.meta.env.VITE_CHAT_WEBHOOK_ABSENCE;
    // 文頭に <users/all> を追加することで、Google Chat上で「@全員」として通知されます
    const message = `<users/all> お疲れ様です。本日、${name}さんが欠勤です。\n一緒の業務を担当されている方は調整等よろしくお願いします！`;
    await sendToChat(url, { text: message });
  },

  // 承認通知 (2通送る処理もここにまとめる)
  sendApproval: async (staffMember, year, month, patternSummary, irregularText, remarks) => {
    const url = import.meta.env.VITE_CHAT_WEBHOOK_APPROVAL;
    const mentionText = staffMember.chatUserId ? `<users/${staffMember.chatUserId}>` : `${staffMember.name}さん`;

    // 1通目: メンション
    await sendToChat(url, { text: `${mentionText} シフトが承認されました。` });

    // 2通目: 詳細カード
    const cardPayload = {
      "cardsV2": [{
        "cardId": `shift-approval-${staffMember.id}-${Date.now()}`,
        "card": {
          "header": {
            "title": `【シフト承認】 ${year}年${month}月`,
            "subtitle": staffMember.name,
            "imageUrl": "https://raw.githubusercontent.com/google/material-design-icons/master/png/action/assignment_turned_in/materialicons/48dp/1x/baseline_assignment_turned_in_black_48dp.png",
            "imageType": "CIRCLE"
          },
          "sections": [
            { "header": "基本シフトパターン", "widgets": [{ "textParagraph": { "text": patternSummary } }] },
            { "header": "イレギュラー勤務", "widgets": [{ "textParagraph": { "text": irregularText } }] },
            { "header": "備考", "widgets": [{ "textParagraph": { "text": remarks || 'なし' } }] }
          ]
        }
      }]
    };
    await sendToChat(url, cardPayload);
  }
};
