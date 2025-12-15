import { useState, useEffect, useCallback } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

interface InitializingPageProps {
  projectTitle: string;
}

interface Card {
  id: number;
  icon: string;
  flipped: boolean;
  matched: boolean;
}

const cardIcons = ['🎨', '🚀', '💡', '⚡', '🎯', '🌟', '🔥', '💎'];

export default function InitializingPage({ projectTitle }: InitializingPageProps) {
  const [cards, setCards] = useState<Card[]>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [moves, setMoves] = useState(0);

  const initializeGame = useCallback(() => {
    const shuffledIcons = [...cardIcons, ...cardIcons]
      .sort(() => Math.random() - 0.5)
      .map((icon, index) => ({
        id: index,
        icon,
        flipped: false,
        matched: false,
      }));
    setCards(shuffledIcons);
    setFlippedCards([]);
    setMatchedPairs(0);
    setMoves(0);
  }, []);

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  const handleCardClick = (cardId: number) => {
    if (flippedCards.length === 2) return;
    if (flippedCards.includes(cardId)) return;
    if (cards[cardId].matched) return;

    const newFlipped = [...flippedCards, cardId];
    setFlippedCards(newFlipped);

    const newCards = cards.map(card =>
      card.id === cardId ? { ...card, flipped: true } : card
    );
    setCards(newCards);

    if (newFlipped.length === 2) {
      setMoves(moves + 1);
      const [first, second] = newFlipped;

      if (cards[first].icon === cards[second].icon) {
        setTimeout(() => {
          setCards(prev =>
            prev.map(card =>
              card.id === first || card.id === second
                ? { ...card, matched: true }
                : card
            )
          );
          setMatchedPairs(matchedPairs + 1);
          setFlippedCards([]);
        }, 500);
      } else {
        setTimeout(() => {
          setCards(prev =>
            prev.map(card =>
              card.id === first || card.id === second
                ? { ...card, flipped: false }
                : card
            )
          );
          setFlippedCards([]);
        }, 1000);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            <h1 className="text-2xl font-semibold text-gray-900">正在初始化项目</h1>
          </div>
          <p className="text-gray-600 mb-2">
            <span className="font-medium text-gray-900">{projectTitle}</span>
          </p>
          <p className="text-sm text-gray-500 mb-4">
            正在创建预设文件，请稍候...
          </p>
          <div className="w-full max-w-md mx-auto h-3 bg-blue-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 rounded-full animate-progress-indeterminate"
              style={{
                width: '40%',
              }}
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-medium text-gray-900">翻牌小游戏</h2>
            </div>
            <div className="flex gap-4 text-sm">
              <div className="text-gray-600">
                步数: <span className="font-medium text-gray-900">{moves}</span>
              </div>
              <div className="text-gray-600">
                配对: <span className="font-medium text-gray-900">{matchedPairs}/8</span>
              </div>
            </div>
          </div>

          {matchedPairs === 8 && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-center">
              <p className="text-green-800 font-medium">
                🎉 恭喜完成！用了 {moves} 步
              </p>
              <button
                onClick={initializeGame}
                className="mt-2 px-4 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
              >
                再玩一次
              </button>
            </div>
          )}

          <div className="grid grid-cols-4 gap-3">
            {cards.map((card) => (
              <button
                key={card.id}
                onClick={() => handleCardClick(card.id)}
                disabled={card.matched || card.flipped}
                className={`
                  aspect-square rounded-xl text-4xl font-bold
                  transition-all duration-300 transform
                  ${
                    card.flipped || card.matched
                      ? 'bg-gradient-to-br from-blue-400 to-purple-500 text-white scale-105'
                      : 'bg-gradient-to-br from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 hover:scale-105'
                  }
                  ${card.matched ? 'opacity-60' : ''}
                  disabled:cursor-not-allowed
                  shadow-md hover:shadow-lg
                  flex items-center justify-center
                `}
              >
                {card.flipped || card.matched ? card.icon : '?'}
              </button>
            ))}
          </div>
        </div>

        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-full text-sm text-blue-700">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
            等待初始化完成后自动进入编辑界面
          </div>
        </div>
      </div>
    </div>
  );
}
