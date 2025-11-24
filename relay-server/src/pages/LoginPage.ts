/**
 * Login page template
 * Displays the MobiFai login page with Google OAuth button
 */

export interface LoginPageProps {
  deviceId: string;
  type: 'mac' | 'mobile';
  authUrl: string;
}

export function renderLoginPage({ deviceId, type, authUrl }: LoginPageProps): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>MobiFai Login</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
          
          .logo {
            font-size: 3rem;
            margin-bottom: 1rem;
          }
          
          h1 {
            font-size: 2rem;
            margin-bottom: 0.5rem;
            color: #1d1d1f;
            font-weight: 700;
          }
          
          .subtitle {
            color: #6b7280;
            margin-bottom: 2rem;
            font-size: 0.95rem;
            line-height: 1.5;
          }
          
          .device-type {
            display: inline-block;
            background: #f3f4f6;
            color: #4b5563;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            font-size: 0.875rem;
            font-weight: 500;
            margin-bottom: 2rem;
          }
          
          .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 14px 32px;
            border-radius: 12px;
            text-decoration: none;
            font-weight: 600;
            font-size: 1rem;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
            gap: 10px;
          }
          
          .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
          }
          
          .btn:active {
            transform: translateY(0);
          }
          
          .google-icon {
            width: 20px;
            height: 20px;
            background: white;
            border-radius: 4px;
            padding: 3px;
          }
          
          .footer {
            margin-top: 2rem;
            color: #9ca3af;
            font-size: 0.85rem;
          }
          
          @media (max-width: 480px) {
            .card {
              padding: 2rem 1.5rem;
            }
            
            h1 {
              font-size: 1.5rem;
            }
            
            .logo {
              font-size: 2.5rem;
            }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="logo">🖥️📱</div>
          <h1>Welcome to MobiFai</h1>
          <p class="subtitle">
            Secure terminal access from anywhere.<br>
            Please authenticate to continue.
          </p>
          
          <div class="device-type">
            ${type === 'mac' ? '🖥️ Mac Device' : '📱 Mobile Device'}
          </div>
          
          <a href="${authUrl}" class="btn">
            <svg class="google-icon" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </a>
          
          <div class="footer">
            Connecting device: ${deviceId.slice(0, 8)}...
          </div>
        </div>
      </body>
    </html>
  `;
}

