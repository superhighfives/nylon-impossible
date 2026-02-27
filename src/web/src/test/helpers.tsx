import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type RenderOptions, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { WebSocketSyncContext } from "@/hooks/useWebSocket";

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface TestWrapperProps {
  children: ReactNode;
}

export function createTestWrapper(queryClient?: QueryClient) {
  const qc = queryClient ?? createTestQueryClient();
  const mockWsSync = { notifyChanged: () => {} };

  return function TestWrapper({ children }: TestWrapperProps) {
    return (
      <QueryClientProvider client={qc}>
        <WebSocketSyncContext.Provider value={mockWsSync}>
          {children}
        </WebSocketSyncContext.Provider>
      </QueryClientProvider>
    );
  };
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, "wrapper"> & { queryClient?: QueryClient },
) {
  const { queryClient, ...renderOptions } = options ?? {};
  return render(ui, {
    wrapper: createTestWrapper(queryClient),
    ...renderOptions,
  });
}
