/**
 * Authentication success page template
 * Displayed after successful OAuth authentication
 */

export interface SuccessPageProps {
  userEmail: string;
  deviceType: 'mac' | 'mobile';
}

export function renderSuccessPage({ userEmail, deviceType }: SuccessPageProps): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Authentication Successful - MobiFai</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
          }
          
          .card {
            background: white;
            padding: 3rem 2rem;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 420px;
            width: 100%;
            animation: slideUp 0.4s ease-out;
          }
          
          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(30px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          
          .success-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
            animation: bounce 0.6s ease-out;
          }
          
          @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-20px); }
          }
          
          h1 {
            font-size: 1.75rem;
            margin-bottom: 1rem;
            color: #10b981;
            font-weight: 700;
          }
          
          .subtitle {
            color: #6b7280;
            margin-bottom: 1.5rem;
            font-size: 1rem;
            line-height: 1.5;
          }
          
          .user-info {
            background: #f3f4f6;
            padding: 1rem;
            border-radius: 8px;
            margin-bottom: 2rem;
          }
          
          .user-email {
            color: #374151;
            font-weight: 600;
            font-size: 0.95rem;
          }
          
          .instructions {
            background: #ecfdf5;
            border-left: 4px solid #10b981;
            padding: 1rem;
            border-radius: 8px;
            text-align: left;
            margin-bottom: 1.5rem;
          }
          
          .instructions p {
            color: #065f46;
            font-size: 0.9rem;
            line-height: 1.6;
          }
          
          .close-btn {
            display: inline-block;
            background: #f3f4f6;
            color: #6b7280;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 500;
            font-size: 0.9rem;
            transition: all 0.2s ease;
            cursor: pointer;
            border: none;
          }
          
          .close-btn:hover {
            background: #e5e7eb;
            color: #374151;
          }
          
          @media (max-width: 480px) {
            .card {
              padding: 2rem 1.5rem;
            }
            
            h1 {
              font-size: 1.5rem;
            }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="success-icon">✅</div>
          <h1>Authentication Successful!</h1>
          
          <div class="user-info">
            <div class="user-email">${userEmail}</div>
          </div>
          
          <div class="instructions">
            <p>
              <strong>${deviceType === 'mac' ? '🖥️ Mac Device:' : '📱 Mobile Device:'}</strong><br>
              ${deviceType === 'mac' 
                ? 'You can now close this window and return to your terminal. Your device is ready to connect.'
                : 'You can now close this window and return to the mobile app to continue.'}
            </p>
          </div>
          
          <button class="close-btn" onclick="window.close()">
            Close Window
          </button>
        </div>
        
        <script>
          // Auto-close after 3 seconds (may not work in all browsers)
          setTimeout(() => {
            window.close();
          }, 3000);
        </script>
      </body>
    </html>
  `;
}

