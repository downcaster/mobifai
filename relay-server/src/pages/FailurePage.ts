/**
 * Authentication failure page template
 * Displayed when OAuth authentication fails
 */

export interface FailurePageProps {
  errorMessage?: string;
}

export function renderFailurePage({ errorMessage }: FailurePageProps = {}): string {
  const defaultMessage = 'Authentication failed. Please try again.';
  const message = errorMessage || defaultMessage;
  
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Authentication Failed - MobiFai</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
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
          
          .error-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
            animation: shake 0.5s ease-out;
          }
          
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-10px); }
            75% { transform: translateX(10px); }
          }
          
          h1 {
            font-size: 1.75rem;
            margin-bottom: 1rem;
            color: #dc2626;
            font-weight: 700;
          }
          
          .subtitle {
            color: #6b7280;
            margin-bottom: 1.5rem;
            font-size: 1rem;
            line-height: 1.5;
          }
          
          .error-message {
            background: #fef2f2;
            border-left: 4px solid #dc2626;
            padding: 1rem;
            border-radius: 8px;
            text-align: left;
            margin-bottom: 2rem;
          }
          
          .error-message p {
            color: #991b1b;
            font-size: 0.9rem;
            line-height: 1.6;
          }
          
          .actions {
            display: flex;
            gap: 1rem;
            justify-content: center;
          }
          
          .btn {
            flex: 1;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 500;
            font-size: 0.9rem;
            transition: all 0.2s ease;
            border: none;
            cursor: pointer;
          }
          
          .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          
          .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
          }
          
          .btn-secondary {
            background: #f3f4f6;
            color: #6b7280;
          }
          
          .btn-secondary:hover {
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
            
            .actions {
              flex-direction: column;
            }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="error-icon">❌</div>
          <h1>Authentication Failed</h1>
          <p class="subtitle">
            We couldn't authenticate your account. Please try again.
          </p>
          
          <div class="error-message">
            <p><strong>Error:</strong> ${message}</p>
          </div>
          
          <div class="actions">
            <button class="btn btn-primary" onclick="window.history.back()">
              Try Again
            </button>
            <button class="btn btn-secondary" onclick="window.close()">
              Close
            </button>
          </div>
        </div>
      </body>
    </html>
  `;
}

