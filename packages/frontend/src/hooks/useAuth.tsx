// src/hooks/useAuth.tsx
import { createContext, useContext, JSX } from "solid-js";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/solid-query";

import * as authApi from "~/api/auth";
import { ApiError } from "~/api/base";

import type {
  UserProfileRespBody,
  UserSuccessRespBody,
  LoginReqBody,
  RegisterReqBody,
  ErrorResp,
  VerifyReqBody,
  MessageResp,
} from "@generale/types";

type User = UserProfileRespBody;

export type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  isFetching: boolean;
  login: (payload: LoginReqBody) => Promise<User>;
  register: (payload: RegisterReqBody) => Promise<MessageResp>;
  verify: (payload: VerifyReqBody) => Promise<MessageResp>;
  logout: () => Promise<void>;
  refresh: () => Promise<User | null>;
  updateProfile: (body: Partial<Pick<UserProfileRespBody, "email">>) => Promise<User>;
};

const AuthContext = createContext<AuthContextValue>();

export function AuthProvider(props: { children: JSX.Element }) {
  const qc = useQueryClient();

  // -----------------------
  // me query
  // -----------------------
  const meQuery = useQuery(() => ({
    queryKey: ["me"],
    queryFn: authApi.meApi,
    retry: false,
    refetchOnWindowFocus: true,
  }));

  // -----------------------
  // mutations
  // -----------------------
  const loginMutation = useMutation<
    UserSuccessRespBody,
    ApiError<ErrorResp>,
    LoginReqBody
  >(() => ({
    mutationFn: (vars: LoginReqBody) => authApi.loginApi(vars),
    onSuccess: (data) => {
      qc.setQueryData(["me"], data);
    },
  }));

  const registerMutation = useMutation<
    MessageResp,
    ApiError<ErrorResp>,
    RegisterReqBody
  >(() => ({
    mutationFn: (vars) => authApi.registerApi(vars),
  }));

  const verifyMutation = useMutation<
    MessageResp,
    ApiError<ErrorResp>,
    VerifyReqBody
  >(() => ({
    mutationFn: (vars) => authApi.verifyApi(vars),
  }));

  const logoutMutation = useMutation<
    { ok: true },
    ApiError<ErrorResp>,
    void
  >(() => ({
    mutationFn: () => authApi.logoutApi(),
    onSuccess: () => {
      qc.setQueryData(["me"], null);
    },
  }));

  const updateProfileMutation = useMutation<
    UserSuccessRespBody,
    ApiError<ErrorResp>,
    Partial<Pick<UserProfileRespBody, "email">>
  >(() => ({
    mutationFn: (body) => authApi.patchProfileApi(body),
    onSuccess: (data) => {
      qc.setQueryData(["me"], data);
    },
  }));

  // -----------------------
  // context value
  // -----------------------
  const value: AuthContextValue = {
    get user() {
      return (meQuery.data as UserSuccessRespBody | undefined)?.user ?? null;
    },
    get isLoading() {
      return meQuery.isLoading;
    },
    get isFetching() {
      return meQuery.isFetching;
    },
    login: async (payload) => {
      const res = await loginMutation.mutateAsync(payload);
      return res.user;
    },
    register: async (payload) => {
      return registerMutation.mutateAsync(payload);
    },
    verify: async (payload) => {
      return verifyMutation.mutateAsync(payload);
    },
    logout: async () => {
      await logoutMutation.mutateAsync();
    },
    refresh: async () => {
      const fresh = (await qc.fetchQuery<UserSuccessRespBody, ApiError<ErrorResp>>({
        queryKey: ["me"],
        queryFn: authApi.meApi,
      })) as UserSuccessRespBody | undefined;
      return fresh?.user ?? null;
    },
    updateProfile: async (body) => {
      const res = await updateProfileMutation.mutateAsync(body);
      return res.user;
    },
  };

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
