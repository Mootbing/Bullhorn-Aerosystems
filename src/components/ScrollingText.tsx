'use client';

import { useState, useEffect, useRef, useMemo } from 'react';

interface ScrollingTextProps {
  text: string;
  className?: string;
}

const DIGITS = '0123456789';
const LETTERS_LOWER = 'abcdefghijklmnopqrstuvwxyz';
const LETTERS_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function getCharacterSet(char: string): string | null {
  if (DIGITS.includes(char)) return DIGITS;
  if (LETTERS_LOWER.includes(char)) return LETTERS_LOWER;
  if (LETTERS_UPPER.includes(char)) return LETTERS_UPPER;
  return null;
}

function getScrollPath(from: string, to: string): string[] {
  const charSet = getCharacterSet(to);
  if (!charSet || from === to) return [to];
  
  const fromSet = getCharacterSet(from);
  if (fromSet !== charSet) {
    // Different character sets, just show the new char
    return [to];
  }
  
  const fromIdx = charSet.indexOf(from);
  const toIdx = charSet.indexOf(to);
  
  const path: string[] = [];
  
  // Determine shortest direction
  const forwardDist = (toIdx - fromIdx + charSet.length) % charSet.length;
  const backwardDist = (fromIdx - toIdx + charSet.length) % charSet.length;
  
  if (forwardDist <= backwardDist) {
    // Go forward (up)
    for (let i = 0; i <= forwardDist; i++) {
      path.push(charSet[(fromIdx + i) % charSet.length]);
    }
  } else {
    // Go backward (down)
    for (let i = 0; i <= backwardDist; i++) {
      path.push(charSet[(fromIdx - i + charSet.length) % charSet.length]);
    }
  }
  
  return path;
}

interface CharacterSlotProps {
  char: string;
  prevChar: string;
  delay: number;
}

function CharacterSlot({ char, prevChar, delay }: CharacterSlotProps) {
  const [scrollPath, setScrollPath] = useState<string[]>([char]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (char !== prevChar) {
      const path = getScrollPath(prevChar, char);
      setScrollPath(path);
      setCurrentIdx(0);
      setIsAnimating(true);
      
      // Animate through the path
      let idx = 0;
      const stepDuration = Math.min(80, 400 / path.length);
      
      const animate = () => {
        if (idx < path.length - 1) {
          idx++;
          setCurrentIdx(idx);
          animationRef.current = setTimeout(animate, stepDuration);
        } else {
          setIsAnimating(false);
        }
      };
      
      animationRef.current = setTimeout(animate, delay);
      
      return () => {
        if (animationRef.current) {
          clearTimeout(animationRef.current);
        }
      };
    }
  }, [char, prevChar, delay]);
  
  const displayChar = scrollPath[currentIdx] || char;
  const charSet = getCharacterSet(char);
  
  if (!charSet) {
    // Non-scrollable character, just render it
    return <span className="inline-block">{char}</span>;
  }
  
  return (
    <span 
      className="inline-block relative overflow-hidden"
      style={{ 
        height: '1.2em',
        verticalAlign: 'bottom'
      }}
    >
      <span 
        className={`inline-block transition-transform ${isAnimating ? 'text-[#00ff88]' : ''}`}
        style={{
          transitionDuration: isAnimating ? '50ms' : '200ms',
        }}
      >
        {displayChar}
      </span>
    </span>
  );
}

export function ScrollingText({ text, className = '' }: ScrollingTextProps) {
  const [prevText, setPrevText] = useState(text);
  const [currentText, setCurrentText] = useState(text);
  const isFirstRender = useRef(true);
  
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    
    if (text !== currentText) {
      setPrevText(currentText);
      setCurrentText(text);
    }
  }, [text, currentText]);
  
  // Pad strings to same length for smooth transitions
  const maxLen = Math.max(prevText.length, currentText.length);
  const paddedPrev = prevText.padEnd(maxLen, ' ');
  const paddedCurrent = currentText.padEnd(maxLen, ' ');
  
  const characters = useMemo(() => {
    return paddedCurrent.split('').map((char, i) => ({
      char,
      prevChar: paddedPrev[i] || ' ',
      key: i
    }));
  }, [paddedCurrent, paddedPrev]);
  
  return (
    <span className={className}>
      {characters.map(({ char, prevChar, key }) => (
        <CharacterSlot
          key={key}
          char={char}
          prevChar={prevChar}
          delay={key * 20}
        />
      ))}
    </span>
  );
}
