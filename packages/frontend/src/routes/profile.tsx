import { useAuth } from "~/hooks/useAuth";
import { useNavigate } from "@solidjs/router";
import { ProtectedRoute } from "~/components/ProtectedRoute";

export default function ProfilePage() {
  const auth = useAuth();
  const nav = useNavigate();

  if (auth.isLoading) return <p>加载中...</p>;
  if (!auth.user) {
    nav("/login");
    return null;
  }

  return (
    <ProtectedRoute>
      <div class="p-4">
        <h1 class="text-2xl">个人资料</h1>
        <p>用户名: {auth.user.username}</p>
        <p>邮箱: {auth.user.email}</p>
        <button class="btn btn-outline mt-4" onClick={auth.logout}>
          退出登录
        </button>
      </div>
    </ProtectedRoute>
  );
}
