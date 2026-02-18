// ... existing code ...
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
  },

  // 承認後の変更通知 (新規追加)
  sendChangeAfterApproval: async (name, year, month, day, valueStr, mentions = '') => {
    const url = import.meta.env.VITE_CHAT_WEBHOOK_SUBMISSION; // 管理者向けなので提出用Webhookを使用
    const message = `${mentions} 【変更通知】\n${name}さんの承認済みシフトが変更されました。\n日付: ${month}/${day}\n変更内容: ${valueStr}\n※承認ステータスを解除しました。`;
    await sendToChat(url, { text: message });
  }
};
