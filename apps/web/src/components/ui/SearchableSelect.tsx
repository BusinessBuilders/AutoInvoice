'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  code?: string;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  className = '',
  disabled = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Find the current selected option
  const selectedOption = options.find((opt) => opt.value === value);

  // Filter options based on search
  const filteredOptions = search
    ? options.filter(
        (opt) =>
          opt.label.toLowerCase().includes(search.toLowerCase()) ||
          (opt.code && opt.code.toLowerCase().includes(search.toLowerCase()))
      )
    : options;

  // Reset highlight when filtered options change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [search]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current && highlightedIndex >= 0) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (optionValue: string) => {
      onChange(optionValue);
      setIsOpen(false);
      setSearch('');
    },
    [onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setHighlightedIndex((prev) =>
            prev < filteredOptions.length - 1 ? prev + 1 : prev
          );
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (isOpen && filteredOptions[highlightedIndex]) {
          handleSelect(filteredOptions[highlightedIndex].value);
        } else {
          setIsOpen(true);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSearch('');
        break;
      case 'Tab':
        setIsOpen(false);
        setSearch('');
        break;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    if (!isOpen) setIsOpen(true);
  };

  const handleInputFocus = () => {
    if (!disabled) {
      setIsOpen(true);
      // Select all text on focus for easy replacement
      inputRef.current?.select();
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={isOpen ? search : selectedOption?.label || ''}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={`w-full px-2 py-1 text-sm border rounded focus:ring-blue-500 focus:border-blue-500 pr-6 ${
          disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white cursor-text'
        } ${!value ? 'text-gray-400' : 'text-gray-900'}`}
      />

      {/* Dropdown arrow */}
      <div
        className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400"
        aria-hidden="true"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Dropdown list */}
      {isOpen && (
        <ul
          ref={listRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto"
        >
          {filteredOptions.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">No matches found</li>
          ) : (
            filteredOptions.map((option, index) => (
              <li
                key={option.value}
                onClick={() => handleSelect(option.value)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`px-3 py-2 text-sm cursor-pointer ${
                  highlightedIndex === index
                    ? 'bg-blue-100 text-blue-900'
                    : option.value === value
                    ? 'bg-gray-100'
                    : 'hover:bg-gray-50'
                }`}
              >
                {option.code && (
                  <span className="font-mono text-xs text-gray-500 mr-2">{option.code}</span>
                )}
                {option.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
