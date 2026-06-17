import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export const OTHER_OPTION_ID = 'other';

export interface UserQuestionOption {
  id: string;
  label: string;
}

export interface UserQuestion {
  id: string;
  prompt: string;
  options: UserQuestionOption[];
  allowMultiple?: boolean;
}

export interface UserQuestionRequest {
  chatId: string;
  messageId: string;
  toolCallId: string;
  title?: string;
  questions: UserQuestion[];
  timestamp: number;
}

interface AskUserState {
  pendingRequests: Record<string, UserQuestionRequest>;
}

const initialState: AskUserState = {
  pendingRequests: {},
};

const askUserSlice = createSlice({
  name: 'askUser',
  initialState,
  reducers: {
    addUserQuestionRequest: (
      state,
      action: PayloadAction<UserQuestionRequest>
    ) => {
      state.pendingRequests[action.payload.toolCallId] = action.payload;
    },
    removeUserQuestionRequest: (state, action: PayloadAction<string>) => {
      delete state.pendingRequests[action.payload];
    },
    clearAllUserQuestionRequests: (state) => {
      state.pendingRequests = {};
    },
  },
});

export const {
  addUserQuestionRequest,
  removeUserQuestionRequest,
  clearAllUserQuestionRequests,
} = askUserSlice.actions;

export default askUserSlice.reducer;
