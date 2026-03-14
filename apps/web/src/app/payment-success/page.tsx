export default function PaymentSuccessPage() {
  return (
    <div className="min-h-screen bg-green-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Received!</h1>
        <p className="text-gray-600 mb-6">
          Thank you for your payment. Your account has been updated.
        </p>
        <p className="text-sm text-gray-400">
          You can close this page.
        </p>
      </div>
    </div>
  );
}
