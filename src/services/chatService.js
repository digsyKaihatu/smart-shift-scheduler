import { formatValue } from '../utils/dateUtils'; 

// Google Chat Webhook URL (環境変数から取得)
// 念のため、以前の変数名と新しい変数名の両方に対応できるようにしています
const WEBHOOK_URL = import.meta.env.VITE_GOOGLE_CHAT_WEBHOOK_URL || import.meta.env.VITE_CHAT_WEBHOOK_URL;

export const chatService = {
  /**
   * 承認通知を送信
   */
  async sendApproval(staff, year, month, patternSummary, irregularities, remarks) {
    if (!WEBHOOK_URL) {
      console.warn('Google Chat Webhook URL is not set.');
      return;
    }

    const mention = staff.chatUserId ? `<users/${staff.chatUserId}>` : '';
    const title = `${year}年${month}月 シフト承認のお知らせ`;
    const subtitle = `${staff.name} さん`;

    const card = {
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
              widgets: [{ textParagraph: { text: irregularities } }]
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

    try {
        await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(card)
        });
    } catch (e) {
        console.error("Failed to send approval notification", e);
        throw e;
    }
  },

  /**
   * シフト変更通知を送信（承認済みシフトの修正時・個別用）
   */
  async sendShiftChange(staff, year, month, day, oldValue, newValue) {
    if (!WEBHOOK_URL) return;

    const mention = staff.chatUserId ? `<users/${staff.chatUserId}>` : '';
    const dateStr = `${year}/${month}/${day}`;
    
    // 表示用に値を整形
    const displayOld = oldValue || '(未入力)';
    const displayNew = newValue || '(削除)';

    const card = {
      cardsV2: [{
        cardId: `change-card-${Date.now()}`,
        card: {
          header: {
            title: "シフト変更のお知らせ",
            subtitle: `${staff.name} さん (承認済みシフトの変更)`,
            imageUrl: "https://www.gstatic.com/images/icons/material/system/2x/edit_black_48dp.png",
            imageType: "CIRCLE"
          },
          sections: [
            {
              widgets: [
                {
                  decoratedText: {
                    topLabel: "変更日",
                    text: dateStr,
                    startIcon: { knownIcon: "CALENDAR_TODAY" }
                  }
                },
                {
                  decoratedText: {
                    topLabel: "変更内容",
                    text: `${displayOld} ➔ <font color=\"#ff0000\">${displayNew}</font>`,
                    startIcon: { knownIcon: "DESCRIPTION" }
                  }
                },
                {
                  textParagraph: {
                    text: `${mention} \n承認後のシフトに変更がありました。上記内容をご確認ください。`
                  }
                }
              ]
            }
          ]
        }
      }]
    };

    try {
        await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(card)
        });
    } catch (e) {
        console.error("Failed to send shift change notification", e);
        throw e;
    }
  },

  /**
   * 承認後の変更確定通知を送信（現在のアプリ仕様の一括通知用）
   */
  async sendChangeAfterApproval(name, year, month, dateSummary, changeDetails, mentions) {
    if (!WEBHOOK_URL) return;

    const title = `${year}年${month}月 シフト変更のお知らせ`;
    const subtitle = `${name} さん (承認済みシフトの変更)`;

    const card = {
      cardsV2: [{
        cardId: `bulk-change-card-${Date.now()}`,
        card: {
          header: {
            title: title,
            subtitle: subtitle,
            imageUrl: "https://www.gstatic.com/images/icons/material/system/2x/edit_black_48dp.png",
            imageType: "CIRCLE"
          },
          sections: [
            {
              header: "変更対象日",
              widgets: [{ textParagraph: { text: dateSummary } }]
            },
            {
              header: "変更内容詳細",
              widgets: [{ textParagraph: { text: changeDetails } }]
            },
            {
              widgets: [
                {
                  textParagraph: {
                    text: `${mentions ? mentions + '\n' : ''}承認後のシフトに変更・確定がありました。上記内容をご確認ください。`
                  }
                }
              ]
            }
          ]
        }
      }]
    };

    try {
        await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(card)
        });
    } catch (e) {
        console.error("Failed to send bulk shift change notification", e);
        throw e;
    }
  },

  /**
   * 提出通知
   */
  async sendSubmission(name, year, month, mentions) {
    if (!WEBHOOK_URL) return;
    try {
        await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `${mentions ? mentions : ''} \n${name}さんが${year}年${month}月のシフトを提出しました。確認をお願いします。`
          })
        });
    } catch (e) {
        console.error("Failed to send submission notification", e);
        throw e;
    }
  },

  /**
   * 差戻通知
   */
  async sendRemand(name, chatUserId) {
    if (!WEBHOOK_URL) return;
    const mention = chatUserId ? `<users/${chatUserId}>` : '';
    try {
        await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `${mention} \n${name}さんのシフトが差し戻されました。修正して再提出してください。`
          })
        });
    } catch (e) {
        console.error("Failed to send remand notification", e);
        throw e;
    }
  },

  /**
   * 欠勤通知
   */
  async sendAbsence(name) {
    if (!WEBHOOK_URL) return;
    try {
        await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `【欠勤連絡】\n本日は ${name} さんが欠勤となります。業務調整をお願いします。`
          })
        });
    } catch (e) {
        console.error("Failed to send absence notification", e);
        throw e;
    }
  }
};
