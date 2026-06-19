import type { RootState } from '@/app/store';
import type { SendMessageContext } from '../types';
import { llmConnectionsApi } from '@/features/llm';
import { mcpConnectionsApi } from '@/features/mcp';
import { messagesApi } from '@/features/chat/state/messagesApi';

import type { LLMConnection } from '@/features/llm';
import type { MCPServerConnection } from '@/features/mcp';

/**
 * Validate and extract state values from Redux state
 * @throws Error if validation fails
 */
export function validateAndExtractState(
  state: RootState,
  chatId: string
): SendMessageContext {
  const selectedWorkspaceId = state.workspaces.selectedWorkspaceId;
  if (!selectedWorkspaceId) {
    throw new Error('No workspace selected');
  }

  const workspaceSettings =
    state.workspaceSettings.settingsByWorkspaceId[selectedWorkspaceId];
  let llmConnectionId = workspaceSettings?.llmConnectionId;
  let selectedModel = state.chatInput.selectedModel;

  if (selectedModel?.includes('::')) {
    const [connId, ...modelIdParts] = selectedModel.split('::');
    llmConnectionId = connId;
    selectedModel = modelIdParts.join('::');
  }

  if (!llmConnectionId) {
    throw new Error('No LLM connection configured');
  }

  // Use RTK Query selectors
  const llmConnectionsResult =
    llmConnectionsApi.endpoints.getLLMConnections.select()(state);
  const llmConnections = (llmConnectionsResult.data || []) as LLMConnection[];

  const llmConnection = llmConnections.find(
    (conn) => conn.id === llmConnectionId
  );
  if (!llmConnection) {
    throw new Error('LLM connection not found');
  }

  if (!selectedModel) {
    throw new Error('No model selected');
  }

  const streamEnabled = workspaceSettings?.streamEnabled ?? true;
  const systemMessage = workspaceSettings?.systemMessage || '';

  const existingMessages =
    messagesApi.endpoints.getMessages.select(chatId)(state).data ?? [];

  // Get MCP connections from workspace settings
  const mcpToolIds = workspaceSettings?.mcpToolIds || {};
  const mcpConnectionIds = Array.from(new Set(Object.values(mcpToolIds)));

  const mcpConnectionsResult =
    mcpConnectionsApi.endpoints.getMCPConnections.select()(state);
  const allMcpConnections = (mcpConnectionsResult.data ||
    []) as MCPServerConnection[];

  const mcpConnections = allMcpConnections.filter((conn) =>
    mcpConnectionIds.includes(conn.id)
  );

  return {
    workspaceSettings: workspaceSettings || {
      id: selectedWorkspaceId,
      name: '',
      llmConnectionId,
      systemMessage,
      mcpToolIds,
      streamEnabled,
      maxAgentIterations: 10,
      toolPermissionConfig: {},
    },
    llmConnection,
    selectedModel,
    streamEnabled,
    existingMessages,
    mcpConnections,
  };
}
