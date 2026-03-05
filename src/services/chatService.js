import { formatValue } from '../utils/dateUtils'; 

/**
 * 環境変数の取得と検証
 * Viteでは VITE_ で始まる変数のみがクライアントサイドで有効です。
 * 安定版で使用されていた VITE_GOOGLE_CHAT_WEBHOOK_URL を優先的にチェックします。
 */
const WEBHOOK_URL = (
  import.meta.env.VITE_GOOGLE_CHAT_WEBHOOK_URL || 
  import.meta.env.VITE_CHAT_WEBHOOK_URL || 
  ''
).trim();

/**
 * 共通のフェッチ処理（レスポンスチェック付き）
 */
async function postToChat(payload, type = 'notification') {
  if (!WEBHOOK_URL) {
    // 修正: サイレントに終了せず、エラーを投げてUI側に通知する
    const errorMsg = `[ChatService] Webhook URLが設定されていません (${type})`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ChatService] Google Chatからのエラー返信 (${type}):`, errorText);
      throw new Error(`Google Chat送信失敗: ${response.status}`);
    }

    console.log(`[ChatService] 送信成功 (${type})`);
    return true;
  } catch (e) {
    console.error(`[ChatService] 通信エラー (${type}):`, e);
    throw e;
  }
}

export const chatService = {
  /**
   * 承認通知を送信
   */
  async sendApproval(staff, year, month, patternSummary, irregularities, remarks) {
    const mention = staff.chatUserId ? `<users/${staff.chatUserId}>` : '';
    const title = `${year}年${month}月 シフト承認のお知らせ`;
    const subtitle = `${staff.name} さん`;

    const payload = {
      cardsV2: [{
        cardId: "approval-card",
        card: {
          header: {
            title: title,
            subtitle: subtitle,
            imageUrl: "https://www.gstatic.com/images/icons/material/system/2x/check_circle_black_48dp.png",
            imageType: "CIRCLE"
          },
          sections: [
            {
              header: "基本シフトパターン",
              widgets: [{ textParagraph: { text: patternSummary } }]
            },
            {
              header: "特記事項 (パターンと異なる日)",
              widgets: [{ textParagraph: { text: irregularities || "なし" } }]
            },
            {
              header: "管理者コメント",
              widgets: [{ textParagraph: { text: remarks || "なし" } }]
            },
            {
              widgets: [
                {
                  textParagraph: {
                    text: `${mention} \n上記内容でシフトが確定しました。ご確認ください。`
                  }
                }
              ]
            }
          ]
        }
      }]
    };

    return await postToChat(payload, 'Approval');
  },

  /**
   * シフト変更通知（一括確定用）
   */
  async sendChangeAfterApproval(name, year, month, dateSummary, changeDetails, mentions) {
    const title = `${year}年${month}月 シフト変更のお知らせ`;
    const subtitle = `${name} さん`;

    const payload = {
      cardsV2: [{
        cardId: `bulk-change-${Date.now()}`,
        card: {
          header: {
            title: title,
            subtitle: subtitle,
            imageUrl: "https://www.gstatic.com/images/icons/material/system/2x/edit_black_48dp.png",
            imageType: "CIRCLE"
          },
          sections: [
            {
              header: "対象日",
              widgets: [{ textParagraph: { text: dateSummary } }]
            },
            {
              header: "変更詳細",
              widgets: [{ textParagraph: { text: changeDetails } }]
            },
            {
              widgets: [{
                textParagraph: {
                  text: `${mentions ? mentions + '\n' : ''}承認済みのシフトに変更がありました。`
                }
              }]
            }
          ]
        }
      }]
    };

    return await postToChat(payload, 'ChangeAfterApproval');
  },

  /**
   * 提出通知
   */
  async sendSubmission(name, year, month, mentions) {
    const payload = {
      text: `${mentions ? mentions + '\n' : ''}【シフト提出】\n${name}さんが${year}年${month}月のシフトを提出しました。確認をお願いします。`
    };
    return await postToChat(payload, 'Submission');
  },

  /**
   * 差戻通知
   */
  async sendRemand(name, chatUserId) {
    const mention = chatUserId ? `<users/${chatUserId}>` : '';
    const payload = {
      text: `${mention}\n【シフト差戻】\n${name}さんのシフトが差し戻されました。修正して再提出してください。`
    };
    return await postToChat(payload, 'Remand');
  },

  /**
   * 欠勤通知
   */
  async sendAbsence(name) {
    const payload = {
      text: `【欠勤連絡】\n本日は ${name} さんが欠勤となります。業務調整をお願いします。`
    };
    return await postToChat(payload, 'Absence');
  }
};
