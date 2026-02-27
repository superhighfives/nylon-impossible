import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WebSocketSyncContext } from "@/hooks/useWebSocket";
import type { ReactNode } from "react";
import { render, type RenderOptions } from "@testing-library/react";

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
