import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "../api";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("verifying"); // "verifying" | "success" | "error"
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setError("No token found in URL.");
      return;
    }
    api.post("/auth/verify-email", { token })
      .then(() => setStatus("success"))
      .catch((err) => { setStatus("error"); setError(err.message); });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md text-center max-w-sm w-full">
        {status === "verifying" && <p className="text-gray-500">Verifying your email...</p>}
        {status === "success" && (
          <>
            <p className="text-green-700 font-medium mb-3">Email verified!</p>
            <p className="text-gray-500 text-sm mb-4">You can now sign in with your email and password.</p>
            <Link to="/login" className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
              Go to login
            </Link>
          </>
        )}
        {status === "error" && (
          <>
            <p className="text-red-600 font-medium mb-3">{error}</p>
            <Link to="/login" className="text-blue-600 text-sm hover:underline">Back to login</Link>
          </>
        )}
      </div>
    </div>
  );
}
