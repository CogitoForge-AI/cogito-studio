import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
import { Button } from '@/ui/atoms/button/button';
import { cn } from '@/lib/utils';
import { CHAT_WIDTH_CLASSES } from '../ChatLayout';
import {
  OTHER_OPTION_ID,
  type UserQuestion,
  type UserQuestionRequest,
} from '../../state/askUserSlice';
import type { UserQuestionAnswerPayload } from '../../hooks/useAskUser';

interface AskUserPanelProps {
  request: UserQuestionRequest;
  onSubmit: (
    toolCallId: string,
    answers: UserQuestionAnswerPayload[]
  ) => Promise<void>;
  isSubmitting?: boolean;
}

interface QuestionAnswerState {
  optionId: string | null;
  freeText: string;
}

function withOtherOption(question: UserQuestion): UserQuestion {
  const hasOther = question.options.some((o) => o.id === OTHER_OPTION_ID);
  if (hasOther) return question;
  return {
    ...question,
    options: [...question.options, { id: OTHER_OPTION_ID, label: '' }],
  };
}

function isQuestionAnswered(
  questionId: string,
  answers: Record<string, QuestionAnswerState>
): boolean {
  const state = answers[questionId];
  if (!state?.optionId) return false;
  if (state.optionId === OTHER_OPTION_ID) {
    return state.freeText.trim().length > 0;
  }
  return true;
}

export function AskUserPanel({
  request,
  onSubmit,
  isSubmitting = false,
}: AskUserPanelProps) {
  const { t } = useTranslation('chat');

  const questionsWithOther = useMemo(
    () => request.questions.map(withOtherOption),
    [request.questions]
  );

  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, QuestionAnswerState>>(
    () =>
      Object.fromEntries(
        questionsWithOther.map((q) => [q.id, { optionId: null, freeText: '' }])
      )
  );

  const totalSteps = questionsWithOther.length;
  const isLastStep = currentStep === totalSteps - 1;
  const currentQuestion = questionsWithOther[currentStep];
  const currentAnswered = isQuestionAnswered(currentQuestion.id, answers);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [slideWidth, setSlideWidth] = useState(0);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const updateWidth = () => setSlideWidth(el.clientWidth);
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleSelect = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        optionId,
        freeText:
          optionId === OTHER_OPTION_ID
            ? (prev[questionId]?.freeText ?? '')
            : '',
      },
    }));
  };

  const handleFreeTextChange = (questionId: string, freeText: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        optionId: OTHER_OPTION_ID,
        freeText,
      },
    }));
  };

  const handleNext = () => {
    if (!currentAnswered || isLastStep) return;
    setCurrentStep((s) => Math.min(s + 1, totalSteps - 1));
  };

  const handleBack = () => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = async () => {
    if (!currentAnswered || isSubmitting) return;

    const allAnswered = questionsWithOther.every((q) =>
      isQuestionAnswered(q.id, answers)
    );
    if (!allAnswered) return;

    const payload: UserQuestionAnswerPayload[] = questionsWithOther.map((q) => {
      const state = answers[q.id]!;
      return {
        questionId: q.id,
        optionId: state.optionId!,
        freeText:
          state.optionId === OTHER_OPTION_ID
            ? state.freeText.trim()
            : undefined,
      };
    });

    await onSubmit(request.toolCallId, payload);
  };

  const handlePrimaryAction = () => {
    if (isLastStep) {
      void handleSubmit();
    } else {
      handleNext();
    }
  };

  return (
    <div className={cn('w-full px-4 pb-2', CHAT_WIDTH_CLASSES)}>
      <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <HelpCircle className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate text-sm font-medium">
              {request.title || t('askUser.title')}
            </span>
          </div>
          {totalSteps > 1 && (
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {t('askUser.progress', {
                current: currentStep + 1,
                total: totalSteps,
              })}
            </span>
          )}
        </div>

        {/* Horizontal slide — pixel offset avoids %/padding rounding bleed */}
        <div
          ref={viewportRef}
          className="overflow-hidden py-3"
          style={{ visibility: slideWidth > 0 ? 'visible' : 'hidden' }}
        >
          <div
            className="flex transition-transform duration-300 ease-out"
            style={{
              transform:
                slideWidth > 0
                  ? `translate3d(-${currentStep * slideWidth}px, 0, 0)`
                  : undefined,
            }}
          >
            {questionsWithOther.map((question) => (
              <div
                key={question.id}
                className="box-border shrink-0 space-y-3 px-4"
                style={{ width: slideWidth > 0 ? slideWidth : '100%' }}
                aria-hidden={question.id !== currentQuestion.id}
              >
                <p className="text-sm leading-snug font-medium text-foreground">
                  {question.prompt}
                </p>
                <div className="space-y-1">
                  {question.options.map((option) => {
                    const isOther = option.id === OTHER_OPTION_ID;
                    const label = isOther ? t('askUser.other') : option.label;
                    const isSelected =
                      answers[question.id]?.optionId === option.id;

                    return (
                      <div key={option.id}>
                        <label
                          className={cn(
                            'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors',
                            isSelected
                              ? 'border-primary/50 bg-primary/5'
                              : 'border-transparent bg-muted/40 hover:bg-muted/70'
                          )}
                        >
                          <input
                            type="radio"
                            name={`ask-user-${request.toolCallId}-${question.id}`}
                            checked={isSelected}
                            onChange={() =>
                              handleSelect(question.id, option.id)
                            }
                            className="sr-only"
                            disabled={isSubmitting}
                          />
                          <span
                            className={cn(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                              isSelected
                                ? 'border-primary bg-primary'
                                : 'border-muted-foreground/40'
                            )}
                          >
                            {isSelected && (
                              <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                            )}
                          </span>
                          <span className="flex-1">{label}</span>
                        </label>
                        {isOther && isSelected && (
                          <textarea
                            value={answers[question.id]?.freeText ?? ''}
                            onChange={(e) =>
                              handleFreeTextChange(question.id, e.target.value)
                            }
                            placeholder={t('askUser.placeholder')}
                            rows={2}
                            disabled={isSubmitting}
                            className="mt-2 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-2.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={currentStep === 0 || isSubmitting}
            className={cn(currentStep === 0 && 'invisible')}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            {t('askUser.back')}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handlePrimaryAction}
            disabled={!currentAnswered || isSubmitting}
          >
            {isLastStep ? t('askUser.submit') : t('askUser.next')}
            {!isLastStep && <ChevronRight className="ml-1 h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
