import { lowerBound } from '../helpers/algorithms';
import { ensureDefined } from '../helpers/assertions';

import { TickMarkWeight } from './horz-scale-behavior-time/types';
import { InternalHorzScaleItem } from './ihorz-scale-behavior';
import { TickMarkWeightValue, TimePointIndex, TimeScalePoint } from './time-data';

/**
 * Tick mark for the horizontal scale.
 */
export interface TickMark {
	/** Index */
	index: TimePointIndex;
	/** Time / Coordinate */
	time: InternalHorzScaleItem;
	/** Weight of the tick mark */
	weight: TickMarkWeightValue;
	/** Original value for the `time` property */
	originalTime: unknown;
}

interface MarksCache {
	maxIndexesPerMark: number;
	marks: readonly TickMark[];
}

export class TickMarks<HorzScaleItem> {
	private _marksByWeight: Map<TickMarkWeightValue, TickMark[]> = new Map();
	private _cache: MarksCache | null = null;
	private _uniformDistribution: boolean = false;

	public setUniformDistribution(val: boolean): void {
		this._uniformDistribution = val;
		this._cache = null;
	}

	public setTimeScalePoints(newPoints: readonly TimeScalePoint[], firstChangedPointIndex: number): void {
		this._removeMarksSinceIndex(firstChangedPointIndex);

		this._cache = null;

		for (let index = firstChangedPointIndex; index < newPoints.length; ++index) {
			const point = newPoints[index];
			let marksForWeight = this._marksByWeight.get(point.timeWeight);
			if (marksForWeight === undefined) {
				marksForWeight = [];
				this._marksByWeight.set(point.timeWeight, marksForWeight);
			}

			marksForWeight.push({
				index: index as TimePointIndex,
				time: point.time,
				weight: point.timeWeight,
				originalTime: point.originalTime,
			});
		}
	}

	public build(spacing: number, maxWidth: number): readonly TickMark[] {
		const maxIndexesPerMark = Math.ceil(maxWidth / spacing);
		if (this._cache === null || this._cache.maxIndexesPerMark !== maxIndexesPerMark) {
			this._cache = {
				marks: this._buildMarksImpl(maxIndexesPerMark),
				maxIndexesPerMark,
			};
		}

		return this._cache.marks;
	}

	private _removeMarksSinceIndex(sinceIndex: number): void {
		if (sinceIndex === 0) {
			this._marksByWeight.clear();
			return;
		}

		const weightsToClear: TickMarkWeightValue[] = [];

		this._marksByWeight.forEach((marks: TickMark[], timeWeight: TickMarkWeightValue) => {
			if (sinceIndex <= marks[0].index) {
				weightsToClear.push(timeWeight);
			} else {
				marks.splice(
					lowerBound(marks, sinceIndex, (tm: TickMark) => tm.index < sinceIndex),
					Infinity
				);
			}
		});

		for (const weight of weightsToClear) {
			this._marksByWeight.delete(weight);
		}
	}

	// eslint-disable-next-line complexity
	private _buildMarksImpl(maxIndexesPerMark: number): readonly TickMark[] {
		let marks: TickMark[] = [];
		for (const weight of Array.from(this._marksByWeight.keys()).sort((a: number, b: number) => b - a)) {
			if (!this._marksByWeight.get(weight)) {
				continue;
			}

			// Built tickMarks are now prevMarks, and marks it as new array
			const prevMarks = marks;
			marks = [];

			const prevMarksLength = prevMarks.length;
			let prevMarksPointer = 0;
			const currentWeight = ensureDefined(this._marksByWeight.get(weight));
			const currentWeightLength = currentWeight.length;

			let rightIndex = Infinity;
			let leftIndex = -Infinity;
			for (let i = 0; i < currentWeightLength; i++) {
				const mark = currentWeight[i];
				const currentIndex = mark.index;

				// Determine indexes with which current index will be compared
				// All marks to the right is moved to new array
				while (prevMarksPointer < prevMarksLength) {
					const lastMark = prevMarks[prevMarksPointer];
					const lastIndex = lastMark.index;
					if (lastIndex < currentIndex) {
						prevMarksPointer++;
						marks.push(lastMark);
						leftIndex = lastIndex;
						rightIndex = Infinity;
					} else {
						rightIndex = lastIndex;
						break;
					}
				}

				if (rightIndex - currentIndex >= maxIndexesPerMark && currentIndex - leftIndex >= maxIndexesPerMark) {
					// Check if we need to add month mark
					if (this._marksByWeight.has(TickMarkWeight.Month as TickMarkWeightValue) && weight === TickMarkWeight.Day && i !== currentWeightLength - 1 && typeof mark.originalTime === 'number') {
						const startOfTheMonth = new Date(mark.originalTime * 1000);
						startOfTheMonth.setDate(1);
						startOfTheMonth.setHours(0);
						startOfTheMonth.setMinutes(0);
						startOfTheMonth.setSeconds(0);
						const startOfTheMonthUtcSeconds = Math.floor(startOfTheMonth.getTime() / 1000);
						const monthMark = marks.find((m: TickMark) => {
							return m.weight === TickMarkWeight.Month && (m.originalTime as number) >= startOfTheMonthUtcSeconds;
						});
						// If there is no month mark, but current day mark first, promote current mark to month mark
						if (!monthMark && startOfTheMonth.getMonth() !== 0) {
							mark.weight = TickMarkWeight.Month as TickMarkWeightValue;
						}
						marks.push(mark);
					} else {
						// TickMark fits. Place it into new array
						marks.push(mark);
					}
					leftIndex = currentIndex;
				} else {
					if (this._uniformDistribution) {
						return prevMarks;
					}
				}
			}

			// Place all unused tickMarks into new array;
			for (; prevMarksPointer < prevMarksLength; prevMarksPointer++) {
				marks.push(prevMarks[prevMarksPointer]);
			}
		}

		return marks;
	}
}
